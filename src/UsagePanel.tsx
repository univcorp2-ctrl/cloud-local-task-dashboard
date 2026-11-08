import { fmtJst, untilReset, type QuotaView, type UsageRecord } from './controlState';

const PROVIDERS = ['claude', 'codex', 'antigravity', 'muse'];
const LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', muse: 'Muse' };
const QUALITY: Record<string, string> = { measured: '実測', estimated: '推定', self_reported: '自己申告' };
const pct = (n: number | null | undefined) => n == null ? '未計測' : `${n.toFixed(1)}%`;

export function summarizeQuotas(quotas: QuotaView[]) {
  const rows = PROVIDERS.map(provider => {
    const q = quotas.find(q => q.provider === provider);
    const windows = q?.windows.filter(w => w.kind === (provider === 'antigravity' ? 'model' : 'weekly')) ?? [];
    const w = [...windows].sort((a, b) => (b.usedPercent ?? -1) - (a.usedPercent ?? -1))[0];
    const used = w?.usedPercent ?? null;
    const valid = q?.freshness === 'fresh' && used !== null;
    return { provider, q, w, used, valid };
  });
  return { rows, average: rows.every(r => r.valid) ? rows.reduce((sum, r) => sum + r.used!, 0) / 4 : null };
}

export default function UsagePanel({ usage, quotas = [], connected, onConnect }: {
  usage: UsageRecord[]; quotas?: QuotaView[]; connected: boolean; onConnect: () => void;
}) {
  const { rows, average } = summarizeQuotas(quotas);
  return <section className="panel ov-usage" aria-label="タスク別トークン消費">
    <div className="panel-heading"><div><span className="section-kicker">TOKEN SPEND · 7 DAYS</span><h2>AI全体・タスク別の使用状況</h2></div></div>
    <div className="us-overall" aria-label="4AIの週次枠使用率">
      <article><span>全体</span><strong>{pct(average)}</strong><small>4AI平均</small></article>
      {rows.map(({ provider, q, w, used, valid }) => <article key={provider}>
        <span>{LABELS[provider]}</span><strong>{pct(used)}</strong>
        <small>{provider === 'antigravity' ? 'モデル枠最大' : '週次枠'} · {q ? QUALITY[q.quality] : '未計測'}{!valid && used !== null ? '・旧観測（平均対象外）' : ''}</small>
        <small>{untilReset(w?.resetsAt, Date.now()).text}</small><small>観測 {fmtJst(q?.observedAt)}</small>
      </article>)}
    </div>
    <p className="ov-note">4AI平均は各AIの使用枠%を等しく平均した指標です。トークン総数に対する割合ではありません。欠損・古い観測がある間は平均を未計測とします。Antigravityはモデル枠の最大値を使います。</p>
    {!connected ? <div className="ov-empty"><p>タスク別の消費内訳は認証後に表示されます。</p><button type="button" onClick={onConnect}>接続する</button></div> : <div className="us-grid">
      {PROVIDERS.map(provider => {
        const u = usage.find(u => u.provider === provider);
        const stale = u && Date.now() - Date.parse(u.observedAt) > 3 * 86400000;
        const tasks = u?.items.filter(i => i.kind !== 'surface' && !i.note?.includes('・停止中')) ?? [];
        return <article key={provider} className="us-card">
          <header><strong>{LABELS[provider]}</strong><small>週枠使用 {pct(u?.quotaUsedPercent)} · 観測 {fmtJst(u?.observedAt)}{stale ? ' · 旧データ' : ''}</small></header>
          {!tasks.length ? <p className="ov-note">未計測 · タスク別の記録待ち</p> : <div className="us-table-wrap"><table className="us-table">
            <thead><tr><th>タスク名 / 品質</th><th>トークン</th><th>AI内シェア</th><th>AI週枠に対する%</th><th>最終実行</th></tr></thead>
            <tbody>{[...tasks].sort((a, b) => (b.quotaPercent ?? -1) - (a.quotaPercent ?? -1) || (b.tokens ?? -1) - (a.tokens ?? -1)).map(i => <tr key={i.key}>
              <td><strong>{i.label}</strong><small>{QUALITY[i.quality ?? u?.quality ?? ''] ?? '品質未取得'}</small><small>{i.note}</small></td>
              <td data-label="トークン">{i.tokens == null ? '未計測' : i.tokens.toLocaleString('ja-JP')}</td><td data-label="AI内シェア">{pct(i.sharePercent)}</td><td data-label="AI週枠に対する%">{pct(i.quotaPercent)}</td><td data-label="最終実行">{fmtJst(i.lastAt)}</td>
            </tr>)}</tbody>
          </table></div>}
          {!!u?.items.some(i => i.kind === 'surface') && <details><summary>面別の内訳（タスクと重複）</summary>{u.items.filter(i => i.kind === 'surface').map(i => <p key={i.key}>{i.label} · {pct(i.sharePercent)} · {QUALITY[i.quality ?? 'measured']}</p>)}</details>}
          {u && <footer>{u.source}</footer>}
        </article>;
      })}
    </div>}
    <p className="ov-note">AI内シェアはそのAIの記録範囲を分母とします。週枠への帰属は按分推定で、提供元の課金・枠消費の実測ではありません。Claude定期タスクはCowork+Otherをruns×時間で按分します。面別・CLI・定期タスクは重複するため合算しません。Museは自己申告で、内訳が無い場合は全体のみ表示します。</p>
  </section>;
}
