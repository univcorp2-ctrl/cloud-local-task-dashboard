import { fmtJst, type UsageRecord } from './controlState';

const KIND: Record<string, string> = { scheduled: '定期', cli: 'CLI', app: 'アプリ', surface: '面', subagent: 'サブ', worker: 'Worker', other: '他' };
const fmtTok = (n: number | null) => n === null ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`;

export default function UsagePanel({ usage, connected, onConnect }: { usage: UsageRecord[]; connected: boolean; onConnect: () => void }) {
  const byProvider = ['claude', 'codex', 'antigravity', 'muse'].map((p) => usage.find((u) => u.provider === p)).filter((u): u is UsageRecord => Boolean(u));
  // one ranking across providers by "points of that provider's weekly quota" (each AI has its own quota)
  const ranking = byProvider.flatMap((u) => u.items.filter((i) => i.kind !== 'surface' && i.quotaPercent !== null).map((i) => ({ ...i, provider: u.provider })))
    .sort((a, b) => (b.quotaPercent ?? 0) - (a.quotaPercent ?? 0)).slice(0, 10);
  return (
    <section className="panel ov-usage" aria-label="タスク別トークン消費">
      <div className="panel-heading"><div><span className="section-kicker">TOKEN SPEND</span><h2>どのタスクが何%使っているか（直近7日）</h2></div></div>
      {!connected && <div className="ov-empty"><p>タスク別の消費内訳は認証後に表示されます。</p><button type="button" onClick={onConnect}>接続する</button></div>}
      {connected && byProvider.length === 0 && <p className="ov-note">内訳を収集中です（PCの30分ジョブが次に送信します）。</p>}
      {ranking.length > 0 && <>
        <h3 className="us-h">全体ランキング（各AIの週枠を何ポイント使ったか）</h3>
        <ol className="us-rank">
          {ranking.map((i) => <li key={i.provider + i.key}>
            <span className={`us-prov ${i.provider}`}>{i.provider}</span><span className="us-kind">{KIND[i.kind] ?? i.kind}</span>
            <strong title={i.note ?? ''}>{i.label}</strong>
            <div className="us-bar"><span style={{ width: `${Math.min(100, i.quotaPercent ?? 0)}%` }} /></div>
            <em>{(i.quotaPercent ?? 0).toFixed(1)}pt</em>
          </li>)}
        </ol>
      </>}
      <div className="us-grid">
        {byProvider.map((u) => (
          <article key={u.provider} className="us-card">
            <header><strong>{u.provider}</strong><small>週枠使用 {u.quotaUsedPercent ?? '—'}%{u.totalTokens ? ` · ${fmtTok(u.totalTokens)} tok` : ''} · {fmtJst(u.observedAt)}</small></header>
            <ul>
              {u.items.slice(0, 12).map((i) => <li key={i.key}>
                <span className="us-kind">{KIND[i.kind] ?? i.kind}</span>
                <span className="us-label" title={i.note ?? ''}>{i.label}</span>
                <span className="us-num">{i.sharePercent !== null ? `${i.sharePercent.toFixed(1)}%` : fmtTok(i.tokens)}</span>
                <small>{[i.tokens !== null && i.sharePercent !== null ? `${fmtTok(i.tokens)} tok` : '', i.runs !== null ? `${i.runs}回` : '', i.note ?? ''].filter(Boolean).join(' · ')}</small>
              </li>)}
            </ul>
            <footer>{u.source}</footer>
          </article>
        ))}
      </div>
      <p className="ov-note">Claudeの「面」はAnthropic計測の実数。Claude定期タスク別は「週の実行回数×平均実行時間」で面の消費を按分した推定。Codexはセッションログの実トークン。Antigravity・Museはタスク別の記録が提供元に無いため総量のみ。</p>
    </section>
  );
}
