import { useMemo, useState } from 'react';
import { fmtJst } from './controlState';

export type EarnDeal = { id: string; url: string; name: string; state: string; expected: number; probability: number; ev: number; daysToCash: number; nextAction: string; category: string };
export type EarnCategory = {
  code: string; name: string; active: number; deals: number; stopped: number; wins: number; paidTotal: number;
  probability: number; confidence: string; expectedGross: number; ev: number; daysToCash: number; daysEstimated: boolean;
  evPer30d: number; basis: string; topDeal: EarnDeal | null;
};
export type EarnLab = {
  generatedAt: string; total: number; movedToDefense?: number; byState: Record<string, number>; byVariation: Record<string, number>; month: string;
  cash: { paidTotal: number; paidThisMonth: number; paidLast7d: number; costTotal: number; expectedActive: number; paidCount: number };
  active: Array<{ id: string; url: string; name: string; state: string; variation: string; score: number | null; expected: number | null; paid: number | null; nextAction: string; hiroStep: string; updatedAt: string | null; daysToCash: number | null }>;
  hiroSteps: Array<{ id: string; url: string; name: string; state: string; step: string }>;
  recent: Array<{ id: string; url: string; name: string; state: string; updatedAt: string | null; result: string }>;
  categories?: EarnCategory[]; topDeals?: EarnDeal[]; method?: string;
};
const EARN_LAB_URL = 'https://app.notion.com/p/40910562e58b811384a2ff02a4b4d4f1';
const DB_URL = 'https://app.notion.com/p/b2ab0ef9cd664a43836d26fd057bbcdb';
export const yen = (v: number | null | undefined) => v === null || v === undefined ? '—' : v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : `${Math.round(v).toLocaleString('ja-JP')}円`;
const pct = (p: number) => p >= 0.1 ? `${Math.round(p * 100)}%` : `${(p * 100).toFixed(1)}%`;
const stateCls = (s: string) => s === '拡大' ? 'grow' : s === 'テスト中' ? 'test' : s === '停止' ? 'stop' : s === '縮小' ? 'shrink' : 'cand';
const confCls = (c: string) => c === '高' ? 'hi' : c === '中' ? 'mid' : 'lo';
const label = (name: string) => name.replace(/^\d{2}\s*/, '');

type SortKey = 'ev' | 'amount' | 'prob' | 'speed';
const SORTS: Array<[SortKey, string]> = [['ev', '期待値'], ['amount', '金額'], ['prob', '確率'], ['speed', '早さ']];
const sorter: Record<SortKey, (a: EarnCategory, b: EarnCategory) => number> = {
  ev: (a, b) => b.ev - a.ev,
  amount: (a, b) => b.expectedGross - a.expectedGross,
  prob: (a, b) => b.probability - a.probability,
  speed: (a, b) => (b.evPer30d - a.evPer30d) || (a.daysToCash - b.daysToCash),
};

function CategoryCard({ c, rank }: { c: EarnCategory; rank: number }) {
  return (
    <li className="elc-card">
      <div className="elc-head"><span className="elc-rank">{rank}</span><strong>{label(c.name)}</strong><span className={`elc-conf ${confCls(c.confidence)}`}>確率{c.confidence}</span></div>
      <div className="elc-nums">
        <div><span>期待値</span><strong>{yen(c.ev)}</strong></div>
        <div><span>見込み額</span><strong>{yen(c.expectedGross)}</strong></div>
        <div><span>確率</span><strong>{pct(c.probability)}</strong></div>
        <div><span>現金化</span><strong>{c.daysToCash ? `${c.daysToCash}日` : '—'}</strong>{c.daysEstimated && <small>標準値</small>}</div>
      </div>
      <div className="elc-prob" aria-hidden="true"><span style={{ width: `${Math.min(100, c.probability * 100)}%` }} /></div>
      <p className="elc-meta">進行中 {c.deals}件{c.paidTotal > 0 ? ` · 実入金 ${yen(c.paidTotal)}` : ''} · 30日内の期待値 {yen(c.evPer30d)}</p>
      {c.topDeal && <p className="elc-top">一番の案件: <a href={c.topDeal.url} target="_blank" rel="noopener noreferrer">{c.topDeal.name}</a>（{yen(c.topDeal.expected)} × {pct(c.topDeal.probability)}）</p>}
      <details className="elc-basis"><summary>推定の根拠</summary><p>{c.basis}</p></details>
    </li>
  );
}

export default function EarnLabPanel({ data, status, target, connected, onConnect }: { data: EarnLab | null; status: number | 'error' | null; target: number; connected: boolean; onConnect: () => void }) {
  const [sort, setSort] = useState<SortKey>('ev');
  const cats = useMemo(() => [...(data?.categories ?? [])].filter((c) => c.deals > 0 || c.paidTotal > 0).sort(sorter[sort]), [data, sort]);
  const totalEv = cats.reduce((a, c) => a + c.ev, 0);
  const total30 = cats.reduce((a, c) => a + c.evPer30d, 0);
  const progress = data ? Math.min(100, (data.cash.paidThisMonth / target) * 100) : 0;
  return (
    <section className="panel ov-earnlab" id="earn-lab" aria-label="Earn Lab モニタリング">
      <div className="panel-heading"><div><span className="section-kicker">EARN LAB</span><h2>どれが稼げるか</h2></div>
        <div className="ov-head-links"><a href={EARN_LAB_URL} target="_blank" rel="noopener noreferrer">ダッシュボード ↗</a><a href={DB_URL} target="_blank" rel="noopener noreferrer">実験DB ↗</a></div></div>
      {!connected && <div className="ov-empty"><p>カテゴリー別の期待値・確率・現金化日数は、この端末をつなぐと表示されます。</p><button type="button" onClick={onConnect}>この端末をつなぐ</button></div>}
      {connected && !data && <p className="ov-note">{status === null ? '読み込み中…' : `取得できません（${status}）`}</p>}
      {data && <>
        <div className="el-tiles">
          <div><span>今月の実入金</span><strong>{yen(data.cash.paidThisMonth)}</strong><small>目標 {yen(target)}（{progress.toFixed(1)}%）</small></div>
          <div className="accent"><span>期待値の合計（推定）</span><strong>{yen(totalEv)}</strong><small>うち30日内 {yen(total30)}</small></div>
          <div><span>累計実入金</span><strong>{yen(data.cash.paidTotal)}</strong><small>{data.cash.paidCount}件が入金</small></div>
          <div><span>進行中の案件</span><strong>{cats.reduce((a, c) => a + c.deals, 0)}件</strong><small>同額の重複タスクは1件に</small></div>
        </div>

        {cats.length > 0 ? <>
          <div className="elc-toolbar" role="tablist" aria-label="並び順">
            {SORTS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{t}順</button>)}
          </div>
          <ol className="elc-list">{cats.map((c, i) => <CategoryCard key={c.name} c={c} rank={i + 1} />)}</ol>
          <p className="ov-note">「推定」です。{data.method}</p>
        </> : <p className="ov-note">カテゴリー別の推定はまだ集計されていません（API更新待ち）。</p>}

        {(data.topDeals?.length ?? 0) > 0 && <>
          <h3 className="elc-sub">期待値が高い案件トップ10</h3>
          <ol className="elc-deals">
            {data.topDeals!.map((d) => <li key={d.id}>
              <a href={d.url} target="_blank" rel="noopener noreferrer">{d.name}</a>
              <div className="elc-deal-nums"><span className={`el-state ${stateCls(d.state)}`}>{d.state}</span><b>{yen(d.ev)}</b><small>{yen(d.expected)} × {pct(d.probability)} · {d.daysToCash}日 · {label(d.category)}</small></div>
              {d.nextAction && <p>次: {d.nextAction}</p>}
            </li>)}
          </ol>
        </>}

        {data.hiroSteps.length > 0 && <details className="elc-more" open>
          <summary>Hiroの手順が必要（{data.hiroSteps.length}件）</summary>
          <ul className="el-list">{data.hiroSteps.map((r) => <li key={r.id}><div className="el-row"><span className={`el-state ${stateCls(r.state)}`}>{r.state}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a></div><p>{r.step}</p></li>)}</ul>
        </details>}
        <details className="elc-more">
          <summary>最近の更新</summary>
          <ul className="el-list compact">{data.recent.map((r) => <li key={r.id}><div className="el-row"><time>{fmtJst(r.updatedAt, false)}</time><span className={`el-state ${stateCls(r.state)}`}>{r.state}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a></div>{r.result && <small>{r.result}</small>}</li>)}</ul>
        </details>
        <p className="ov-note">集計 {fmtJst(data.generatedAt)} · 実験{data.total}件{data.movedToDefense ? `（iPhone買取・返品の${data.movedToDefense}件は守りのタスクへ移管）` : ''}</p>
      </>}
    </section>
  );
}
