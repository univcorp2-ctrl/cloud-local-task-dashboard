export interface Quota {
  provider: string; remainingPercent?: number | null;
  resetAt?: string | null; weeklyResetAt?: string | null; evidence?: string;
  usedPercent?: number | null; weeklyUsedPercent?: number | null;
  observedAt?: string | null; windowLabel?: string;
  quality?: 'measured' | 'estimated' | 'unavailable' | 'stale'; model?: string;
  modelPools?: Array<{ category: string; usedPercent: number; observedAt?: string | null;
    resetAt?: string | null; quality?: Quota['quality'] }>;
}

function percent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function state(quota: Pick<Quota, 'quality' | 'observedAt'>, now = Date.now()) {
  const time = quota.observedAt ? Date.parse(quota.observedAt) : NaN;
  if (!Number.isFinite(time) || time > now + 300_000 || quota.quality === 'unavailable') return 'unavailable';
  if (now - time > 1_800_000 || quota.quality === 'stale') return 'stale';
  return quota.quality === 'estimated' ? 'estimated' : 'measured';
}

function Timestamp({ value }: { value?: string | null }) {
  return value && Number.isFinite(Date.parse(value))
    ? <time dateTime={value}>{new Date(value).toLocaleString('ja-JP')}</time> : <>不明</>;
}

function WindowUsage({ label, value, reset, quality }: {
  label: string; value: number | null; reset?: string | null; quality: string;
}) {
  const known = value !== null && quality !== 'unavailable';
  return <div className="quota-window">
    <span className="quota-window-label">{label}</span>
    <strong className="quota-value">{known ? (quality === 'stale' ? '前回 ' : '') + Math.round(value) + '%' : '—'}</strong>
    <span className="quota-track" role="img" aria-label={label + (known ? ' 使用率 ' + value + '%' : ' 使用率不明')}>
      <span style={{ width: known ? value + '%' : '0%' }} />
    </span>
    <small>リセット <Timestamp value={reset} /></small>
  </div>;
}

export default function QuotaRow({ quota, now = Date.now(), rank }: { quota: Quota; now?: number; rank?: number }) {
  const quality = state(quota, now);
  const used = percent(quota.usedPercent) ?? (percent(quota.remainingPercent) === null ? null : 100 - quota.remainingPercent!);
  const isModel = quota.provider === 'Gemini / Antigravity CLI';
  return <article className={'quota-row quota-' + quality} aria-label={quota.provider}>
    <div className="quota-provider"><strong>{rank ? <span className="quota-rank">{rank}. </span> : null}{quota.provider}</strong>
      {quota.model && <small>{quota.model}</small>}
    </div>
    <WindowUsage label={isModel ? 'モデル別' : '5時間'} value={used} reset={quota.resetAt} quality={quality} />
    <WindowUsage label="7日間" value={isModel ? null : percent(quota.weeklyUsedPercent)} reset={quota.weeklyResetAt} quality={quality} />
    <div className="quota-status"><strong>{quality === 'stale' ? 'stale（30分超・前回値）' :
      quality === 'measured' ? '実測' : quality === 'estimated' ? '推定' : '取得不能'}</strong>
      <small>観測 <Timestamp value={quota.observedAt} /></small>
      <details><summary>取得元・内訳</summary><small>{quota.evidence || '取得元なし'}</small>
        {isModel && <small>モデル枠の最大使用率。5時間・7日間への換算なし。</small>}
        {quota.modelPools?.map(pool => <div className="quota-pool" key={pool.category}>
          <strong>{pool.category}</strong> {state(pool, now) === 'stale' ? '前回 ' : ''}
          {state(pool, now) !== 'unavailable' && percent(pool.usedPercent) !== null ? Math.round(pool.usedPercent) + '%' : '不明'}
          <small>観測 <Timestamp value={pool.observedAt} /> ／ リセット <Timestamp value={pool.resetAt} /></small>
        </div>)}
      </details>
    </div>
  </article>;
}
