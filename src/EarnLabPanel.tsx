import { fmtJst } from './controlState';

export type EarnLab = {
  generatedAt: string; total: number; byState: Record<string, number>; byVariation: Record<string, number>; month: string;
  cash: { paidTotal: number; paidThisMonth: number; paidLast7d: number; costTotal: number; expectedActive: number; paidCount: number };
  active: Array<{ id: string; url: string; name: string; state: string; variation: string; score: number | null; expected: number | null; paid: number | null; nextAction: string; hiroStep: string; updatedAt: string | null; daysToCash: number | null }>;
  hiroSteps: Array<{ id: string; url: string; name: string; state: string; step: string }>;
  recent: Array<{ id: string; url: string; name: string; state: string; updatedAt: string | null; result: string }>;
};
const EARN_LAB_URL = 'https://app.notion.com/p/40910562e58b811384a2ff02a4b4d4f1';
const DB_URL = 'https://app.notion.com/p/b2ab0ef9cd664a43836d26fd057bbcdb';
const yen = (v: number | null | undefined) => v === null || v === undefined ? '—' : v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : `${Math.round(v).toLocaleString('ja-JP')}円`;
const stateCls = (s: string) => s === '拡大' ? 'grow' : s === 'テスト中' ? 'test' : s === '停止' ? 'stop' : s === '縮小' ? 'shrink' : 'cand';

export default function EarnLabPanel({ data, status, target, connected, onConnect }: { data: EarnLab | null; status: number | 'error' | null; target: number; connected: boolean; onConnect: () => void }) {
  const pct = data ? Math.min(100, (data.cash.paidThisMonth / target) * 100) : 0;
  return (
    <section className="panel ov-earnlab" aria-label="Earn Lab モニタリング">
      <div className="panel-heading"><div><span className="section-kicker">EARN LAB</span><h2>稼ぐ実験の進み方</h2></div>
        <div className="ov-head-links"><a href={EARN_LAB_URL} target="_blank" rel="noopener noreferrer">ダッシュボード ↗</a><a href={DB_URL} target="_blank" rel="noopener noreferrer">実験DB ↗</a></div></div>
      {!connected && <div className="ov-empty"><p>Earn Lab の実入金・テスト状況は認証後に表示されます。</p><button type="button" onClick={onConnect}>接続する</button></div>}
      {connected && !data && <p className="ov-note">{status === null ? '読み込み中…' : `取得できません（${status}）`}</p>}
      {data && <>
        <div className="el-goal">
          <div className="el-goal-head"><span>今月の実入金（{data.month}）</span><strong>{yen(data.cash.paidThisMonth)}</strong><small>/ 目標 {yen(target)}（{pct.toFixed(1)}%）</small></div>
          <div className="ov-bar big"><span style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="el-tiles">
          <div><span>累計実入金</span><strong>{yen(data.cash.paidTotal)}</strong><small>{data.cash.paidCount}件が入金</small></div>
          <div><span>直近7日</span><strong>{yen(data.cash.paidLast7d)}</strong><small>費用累計 {yen(data.cash.costTotal)}</small></div>
          <div><span>見込み（進行中）</span><strong>{yen(data.cash.expectedActive)}</strong><small>根拠ある見込みのみ</small></div>
          <div><span>実験数</span><strong>{data.total}</strong><small>{['候補', 'テスト中', '拡大', '縮小', '停止'].map((s) => `${s}${data.byState[s] ?? 0}`).join(' · ')}</small></div>
        </div>
        <div className="el-cols">
          <div>
            <h3>進行中（スコア順）</h3>
            <ul className="el-list">
              {data.active.map((r) => <li key={r.id}>
                <div className="el-row"><span className={`el-state ${stateCls(r.state)}`}>{r.state}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a><em>{r.score ?? '—'}</em></div>
                <small>{r.variation}{r.expected ? ` · 見込み ${yen(r.expected)}` : ''}{r.paid ? ` · 入金 ${yen(r.paid)}` : ''}{r.daysToCash !== null ? ` · 入金まで${r.daysToCash}日` : ''}</small>
                {r.nextAction && <p>次: {r.nextAction}</p>}
              </li>)}
              {data.active.length === 0 && <li className="ov-note">テスト中・拡大の実験はありません。</li>}
            </ul>
          </div>
          <div>
            <h3>Hiroの手順が必要</h3>
            <ul className="el-list">
              {data.hiroSteps.map((r) => <li key={r.id}><div className="el-row"><span className={`el-state ${stateCls(r.state)}`}>{r.state}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a></div><p>{r.step}</p></li>)}
              {data.hiroSteps.length === 0 && <li className="ov-note">Hiro待ちの手順はありません。</li>}
            </ul>
            <h3>最近の更新</h3>
            <ul className="el-list compact">
              {data.recent.map((r) => <li key={r.id}><div className="el-row"><time>{fmtJst(r.updatedAt, false)}</time><span className={`el-state ${stateCls(r.state)}`}>{r.state}</span><a href={r.url} target="_blank" rel="noopener noreferrer">{r.name}</a></div>{r.result && <small>{r.result}</small>}</li>)}
            </ul>
          </div>
        </div>
      </>}
    </section>
  );
}
