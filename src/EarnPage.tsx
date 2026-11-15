import { useCallback, useEffect, useMemo, useState } from 'react';
import { authHeaders, fmtJst, getShareKey, redeemPairCode, setShareKey, useConnected } from './controlState';
import './earn.css';

export type Stream = {
  id: string; url: string; name: string; kind: string; verdict: string; stage: string;
  earn: number | null; auto: number | null; future: number | null; total: number | null; days: number | null;
  contacts: number | null; replies: number | null; wins: number | null; replyRate: number | null;
  expected: number | null; paid: number | null; prob: number | null; firstCashDate: string | null;
  next: string; issue: string; memo: string;
  capital: number | null; apr: number | null; maxDD: number | null; unrealized: string;
  evidenceUrl: string | null; updatedAt: string | null;
};
export type EarnData = {
  generatedAt: string; via: 'owner' | 'share';
  summary: { paidTotal: number; focus: string[]; grow: string[]; stop: string[]; earnCount: number; investCount: number; unrated: number };
  earn: Stream[]; invest: Stream[]; other: Stream[];
};

const BOARD = 'https://app.notion.com/p/67cfe9e3503444dc9e5aab80d47fa0ea';
export const yen = (v: number | null | undefined) => v === null || v === undefined ? '—'
  : v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : `${Math.round(v).toLocaleString('ja-JP')}円`;
export const daysText = (d: number | null) => d === null ? '未設定' : d <= 1 ? '毎日' : d < 60 ? `約${d}日` : `約${Math.round(d / 30)}か月`;
const short = (name: string) => name.replace(/（[^）]*）/g, '').trim();
const cls: Record<string, string> = { 集中: 'focus', 育てる: 'grow', 継続: 'keep', 検証中: 'test', 縮小: 'shrink', 停止: 'stop' };

export function useEarn(intervalMs = 300_000) {
  const [data, setData] = useState<EarnData | null>(null);
  const [status, setStatus] = useState<number | 'error' | null>(null);
  const connected = useConnected();
  const load = useCallback(async () => {
    const share = getShareKey();
    try {
      const response = await fetch('/api/earn?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', headers: authHeaders(share ? { 'X-TCC-Share': share } : {}) });
      setStatus(response.status);
      if (!response.ok) { setData(null); return; }
      const json = await response.json() as Partial<EarnData> | null;
      // 形が違う応答（古いキャッシュ・別のAPI）は表示しない
      if (!json || !Array.isArray(json.earn) || !Array.isArray(json.invest) || !json.summary) { setStatus('error'); setData(null); return; }
      setData({ ...json, other: Array.isArray(json.other) ? json.other : [] } as EarnData);
    } catch { setStatus('error'); setData(null); }
  }, []);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), intervalMs); return () => window.clearInterval(id); }, [load, intervalMs, connected]);
  return { data, status, reload: load };
}

function Axis({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="ea-axis" aria-label={`${label} ${value ?? '未評価'}／5`}>
      <span>{label}</span>
      <i aria-hidden="true">{[1, 2, 3, 4, 5].map((k) => <b key={k} className={value !== null && k <= value ? 'on' : ''} />)}</i>
      <em>{value ?? '—'}</em>
    </div>
  );
}

function StreamCard({ s, rank }: { s: Stream; rank: number }) {
  const invest = s.kind === '投資案件';
  return (
    <li className={`ea-card ${cls[s.verdict] ?? ''}`}>
      <div className="ea-head">
        <span className="ea-rank">{rank}</span>
        <h3>{s.name}</h3>
        {s.verdict && <span className={`ea-verdict ${cls[s.verdict] ?? ''}`}>{s.verdict}</span>}
      </div>
      <div className="ea-tiles">
        {invest ? <>
          <div><span>利益が出るまで</span><strong>{daysText(s.days)}</strong></div>
          <div><span>想定年利</span><strong>{s.apr !== null ? `${s.apr}%` : '—'}</strong></div>
          <div><span>最大の下落</span><strong>{s.maxDD !== null ? `${s.maxDD}%` : '—'}</strong></div>
        </> : <>
          <div><span>入金まで</span><strong>{daysText(s.days)}</strong></div>
          <div><span>{s.paid ? '実入金' : '見込み'}</span><strong>{s.paid ? yen(s.paid) : s.expected ? yen(s.expected) : '—'}</strong></div>
          <div><span>返信</span><strong>{s.contacts ? `${s.replies ?? 0}/${s.contacts}` : '—'}</strong>{s.replyRate !== null && <small>{Math.round(s.replyRate * 100)}%</small>}</div>
        </>}
      </div>
      {invest && s.unrealized && <p className="ea-unreal"><b>含み益</b>{s.unrealized}</p>}
      <div className="ea-axes"><Axis label="稼げる" value={s.earn} /><Axis label="自動化" value={s.auto} /><Axis label="将来性" value={s.future} /></div>
      {s.next && <p className="ea-next"><b>次</b>{s.next}</p>}
      <details className="ea-more">
        <summary>根拠を見る</summary>
        {s.memo ? <p>{s.memo}</p> : <p>評価メモはまだありません。</p>}
        {s.issue && <p><b>課題：</b>{s.issue}</p>}
        {invest && s.capital !== null && <p><b>想定する資金：</b>{yen(s.capital)}</p>}
        {!invest && s.prob !== null && <p><b>確度：</b>{s.prob}%{s.stage ? `（${s.stage}）` : ''}</p>}
        <p className="ea-links"><a href={s.url} target="_blank" rel="noopener noreferrer">Notionで開く ↗</a>{s.evidenceUrl && <a href={s.evidenceUrl} target="_blank" rel="noopener noreferrer">関連ページ ↗</a>}</p>
      </details>
    </li>
  );
}

function ConnectCard({ onConnect, badShare }: { onConnect: () => void; badShare: boolean }) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'bad'>('idle');
  async function go() {
    if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) { setState('bad'); return; }
    setState('busy');
    if (await redeemPairCode(code)) window.location.reload(); else setState('bad');
  }
  return (
    <section className="ea-connect">
      <h2>この端末ではまだ見られません</h2>
      {badShare && <p className="ea-warn">開いたリンクは無効になっています。新しいリンクを受け取ってください。</p>}
      <p>専用リンクを開くか、つながっているPCで出した8文字のコードを入れてください。</p>
      <div className="ea-connect-form">
        <input inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="8文字のコード" value={code} onChange={(e) => setCode(e.target.value)} aria-label="ペアリングコード" />
        <button type="button" onClick={() => void go()} disabled={state === 'busy'}>{state === 'busy' ? '確認中…' : 'つなぐ'}</button>
      </div>
      {state === 'bad' && <p className="ea-warn" role="alert">コードが違うか、期限切れです（10分・1回限り）。</p>}
      <button type="button" className="ea-ghost" onClick={onConnect}>接続設定を開く</button>
    </section>
  );
}

function ShareBox() {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'revoked'>('idle');
  async function call(method: 'POST' | 'DELETE') {
    setState('busy');
    try {
      const response = await fetch('/api/share', { method, cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
      if (!response.ok) throw new Error('rejected');
      if (method === 'POST') { setUrl(((await response.json()) as { url: string }).url); setState('idle'); } else { setUrl(''); setState('revoked'); }
    } catch { setState('error'); }
  }
  return (
    <details className="ea-share">
      <summary>外から見られるリンク</summary>
      <p>このリンクを知っている人は、ログインなしでこのページ（稼ぐ・投資）だけを見られます。発行し直すと、古いリンクは使えなくなります。</p>
      <div className="ea-share-actions">
        <button type="button" onClick={() => void call('POST')} disabled={state === 'busy'}>リンクを発行する</button>
        <button type="button" className="ea-ghost" onClick={() => void call('DELETE')} disabled={state === 'busy'}>リンクを無効にする</button>
      </div>
      {url && <div className="ea-share-url"><a href={url}>{url}</a><button type="button" onClick={() => void navigator.clipboard?.writeText(url)}>コピー</button></div>}
      {state === 'revoked' && <p>リンクを無効にしました。</p>}
      {state === 'error' && <p className="ea-warn" role="alert">できませんでした。再読み込みしてもう一度お試しください。</p>}
    </details>
  );
}

type Tab = 'earn' | 'invest';
type SortKey = 'rank' | 'fast' | 'auto' | 'future' | 'safe';
const big = 9e9;
const sorters: Record<Exclude<SortKey, 'rank'>, (a: Stream, b: Stream) => number> = {
  fast: (a, b) => (a.days ?? big) - (b.days ?? big),
  auto: (a, b) => (b.auto ?? -1) - (a.auto ?? -1) || (b.earn ?? -1) - (a.earn ?? -1),
  future: (a, b) => (b.future ?? -1) - (a.future ?? -1) || (b.earn ?? -1) - (a.earn ?? -1),
  safe: (a, b) => (a.maxDD ?? big) - (b.maxDD ?? big),
};
const SORTS: Record<Tab, Array<[SortKey, string]>> = {
  earn: [['rank', '稼げやすい順'], ['fast', '入金が早い順'], ['auto', '自動化できる順'], ['future', '将来性の順']],
  invest: [['rank', '稼げやすい順'], ['fast', '利益が早い順'], ['safe', '下落が小さい順']],
};

export default function EarnPage({ onConnect }: { onConnect: () => void }) {
  const { data, status } = useEarn();
  const [tab, setTab] = useState<Tab>('earn');
  const [sort, setSort] = useState<SortKey>('rank');
  const list = useMemo(() => {
    const src = data ? (tab === 'earn' ? data.earn : data.invest) : [];
    return sort === 'rank' ? src : [...src].sort(sorters[sort]);
  }, [data, tab, sort]);
  const denied = status === 401 || status === 403;

  return (
    <div className="ea">
      {!data && status === null && <p className="ea-note">読み込み中…</p>}
      {!data && denied && <ConnectCard onConnect={onConnect} badShare={status === 403 && Boolean(getShareKey())} />}
      {!data && status !== null && !denied && <p className="ea-warn" role="alert">データを取得できませんでした（{String(status)}）。少し待って再読み込みしてください。</p>}
      {data && <>
        <section className="ea-hero" aria-label="まとめ">
          <p>これまでの実入金（Notionの記録）</p>
          <h2>{yen(data.summary.paidTotal)}</h2>
          <div className="ea-concl">
            {data.summary.focus.length > 0 && <div><b>いま集中</b>{data.summary.focus.map((x) => <span key={x}>{short(x)}</span>)}</div>}
            {data.summary.grow.length > 0 && <div><b>育てる</b>{data.summary.grow.map((x) => <span key={x}>{short(x)}</span>)}</div>}
            {data.summary.stop.length > 0 && <div><b>止める</b>{data.summary.stop.map((x) => <span key={x} className="off">{short(x)}</span>)}</div>}
          </div>
        </section>

        <div className="ea-tabs" role="tablist" aria-label="種類">
          <button type="button" role="tab" aria-selected={tab === 'earn'} className={tab === 'earn' ? 'on' : ''} onClick={() => { setTab('earn'); setSort('rank'); }}>稼ぐ案件<small>{data.earn.length}</small></button>
          <button type="button" role="tab" aria-selected={tab === 'invest'} className={tab === 'invest' ? 'on' : ''} onClick={() => { setTab('invest'); setSort('rank'); }}>投資案件<small>{data.invest.length}</small></button>
        </div>
        <div className="ea-sorts" aria-label="並び順">
          {SORTS[tab].map(([k, t]) => <button key={k} type="button" aria-pressed={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{t}</button>)}
        </div>

        {tab === 'invest' && <p className="ea-note">投資案件は推定を含みます。数字は調べた時点の一般的な目安で、利益を約束するものではありません。買う・売るの判断はご自身で行い、AIは売買しません。</p>}
        <ol className="ea-list">{list.map((s, i) => <StreamCard key={s.id} s={s} rank={i + 1} />)}</ol>
        {list.length === 0 && <p className="ea-note">まだ登録がありません。</p>}

        {data.other.length > 0 && <details className="ea-other"><summary>守り・その他（{data.other.length}件）</summary>
          <ul>{data.other.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>{s.verdict && <span className={`ea-verdict ${cls[s.verdict] ?? ''}`}>{s.verdict}</span>}</li>)}</ul>
        </details>}

        <p className="ea-note">点数（稼げる・自動化・将来性）は各5点満点。Notionの実績（送った数・返信・入金）と外部の相場から付けた評価で、推定を含みます。正本は <a href={BOARD} target="_blank" rel="noopener noreferrer">Notion 稼ぐパイプライン盤 ↗</a>。更新 {fmtJst(data.generatedAt)}{data.via === 'share' ? '・共有リンクで表示中' : ''}</p>
        {data.via === 'owner' && <ShareBox />}
        {data.via === 'share' && <button type="button" className="ea-ghost" onClick={() => { setShareKey(''); window.location.reload(); }}>この端末から共有リンクを外す</button>}
      </>}
    </div>
  );
}

/** 全体像ページ用：稼げやすい順トップ3だけ。 */
export function EarnSummary({ onConnect }: { onConnect: () => void }) {
  const { data, status } = useEarn();
  return (
    <section className="panel ea-summary" aria-label="稼ぐ・投資のまとめ">
      <div className="panel-heading"><div><span className="section-kicker">EARN</span><h2>稼げやすい順 トップ3</h2></div><a className="ov-more" href="#earn">稼ぐ・投資を全部見る →</a></div>
      {!data && status === null && <p className="ov-note">読み込み中…</p>}
      {!data && (status === 401 || status === 403) && <div className="ov-empty"><p>この端末をつなぐと表示されます。</p><button type="button" onClick={onConnect}>この端末をつなぐ</button></div>}
      {data && <ol className="ea-top3">{data.earn.slice(0, 3).map((s, i) => (
        <li key={s.id}>
          <span className="ea-rank">{i + 1}</span>
          <div><strong>{s.name}</strong><small>入金まで{daysText(s.days)}・{s.paid ? `実入金 ${yen(s.paid)}` : s.expected ? `見込み ${yen(s.expected)}` : '金額は未確定'}</small></div>
          {s.verdict && <span className={`ea-verdict ${cls[s.verdict] ?? ''}`}>{s.verdict}</span>}
        </li>))}</ol>}
      {data && <p className="ov-note">投資案件{data.invest.length}件は「稼ぐ・投資」ページに分けて載せています。</p>}
    </section>
  );
}
