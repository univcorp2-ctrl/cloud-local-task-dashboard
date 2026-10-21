import { useEffect, useState } from 'react';
import type { Quota } from './QuotaRow';

type Catalog = { quotas?: Quota[] };
const SERVICES = [
  { name: 'Codex', provider: 'Codex CLI' },
  { name: 'Claude', provider: 'Claude Code CLI' },
  { name: 'Antigravity', provider: 'Gemini / Antigravity CLI' },
] as const;
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const remaining = (used: unknown, left: unknown = null): number | null => {
  const exact = percent(left);
  const spent = percent(used);
  return exact ?? (spent === null ? null : Math.round((100 - spent) * 10) / 10);
};
const show = (value: number | null) => value === null ? '—%' : Math.round(value) + '%';
const shortTime = (time: number) =>
  new Date(time).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });

export default function QuotaStrip() {
  const [data, setData] = useState<Catalog | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await fetch('/data/operations-catalog.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('quota_unavailable');
        const next: Catalog = await r.json();
        if (mounted) setData(Array.isArray(next.quotas) ? next : null);
      } catch {
        if (mounted) setData(null);
      }
      if (mounted) setNow(Date.now());
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 120_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  const entries = SERVICES.map(({ name, provider }) => {
    const q = data?.quotas?.find(row => row.provider === provider);
    const observed = q?.observedAt ? Date.parse(q.observedAt) : NaN;
    const age = Number.isFinite(observed) ? now - observed : Infinity;
    const recent = age >= -300_000 && age <= 24 * 60 * 60 * 1000 &&
      q?.quality !== 'stale' && q?.quality !== 'unavailable';
    const live = recent && age <= 35 * 60 * 1000;
    // Model-specific Antigravity quotas are NOT equivalent to a seven-day budget.
    const seven = name === 'Antigravity' ? null :
      recent ? remaining(q?.weeklyUsedPercent) : null;
    const five = recent ? remaining(q?.usedPercent, q?.remainingPercent) : null;
    const status = seven !== null ? (live ? (q?.quality === 'estimated' ? '推定' : '実測') : '前回') : '未取得';
    return { name, seven, five, status, observed, q, recent };
  });

  return <section className="quota-strip" aria-label="AI別 7日間利用枠の残量" role="group">
    <span className="quota-strip-label">7日残量</span>
    {entries.map(item => <div className="quota-week-chip" key={item.name}
        aria-label={item.name + ' 7日間の残量 ' + (item.seven === null ? '未取得' : show(item.seven))}>
      <span className="quota-week-name">{item.name}</span>
      <strong className="quota-week-amount">{show(item.seven)}</strong>
      <span className="quota-week-state">{item.status}</span>
    </div>)}
    <details className="quota-details">
      <summary aria-label="5時間枠と観測日時の詳細を開く">詳細 <span aria-hidden="true">⌄</span></summary>
      <div className="quota-details-content">
        <div className="quota-details-title">利用枠の詳細</div>
        {entries.map(item => <div key={item.name} className="quota-detail-row">
          <strong>{item.name}</strong>
          <span>{item.name === 'Antigravity' ? 'モデル別' : '5時間'} {show(item.five)}</span>
          <span>7日 {show(item.seven)}</span>
          <small>{item.recent && Number.isFinite(item.observed) ? shortTime(item.observed) :
            Number.isFinite(item.observed) ? '旧記録 ' + shortTime(item.observed) : '未取得'}</small>
        </div>)}
        <p>Antigravityのモデル別枠は7日間枠と異なるため、7日残量は未取得と表示します。</p>
      </div>
    </details>
  </section>;
}
