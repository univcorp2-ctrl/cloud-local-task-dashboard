import { useEffect, useState } from 'react';
import type { Quota } from './QuotaRow';

type Catalog = { quotaCollectedAt?: string; quotas?: Quota[] };
const SOURCES = [
  { name: 'Codex', match: 'Codex CLI' },
  { name: 'Claude', match: 'Claude Code CLI' },
  { name: 'Antigravity', match: 'Gemini / Antigravity CLI' },
] as const;
const percentage = (n: unknown): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
const remaining = (used: unknown, remainingValue: unknown) =>
  percentage(remainingValue) ?? (percentage(used) === null ? null : 100 - (used as number));
const printPercent = (value: number | null) => value === null ? '—%' : Math.round(value) + '%';

export default function QuotaStrip() {
  const [data, setData] = useState<Catalog | null>(null);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetch('/data/operations-catalog.json?t=' + Date.now(), { cache: 'no-store' });
        if (!result.ok) throw new Error('fetch failed');
        const payload: Catalog = await result.json();
        if (!cancelled && Array.isArray(payload.quotas)) setData(payload);
      } catch {
        if (!cancelled) setData(null);
      }
      if (!cancelled) setCheckedAt(Date.now());
    };
    void load();
    const interval = window.setInterval(() => void load(), 120_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  return <section className="quota-strip" aria-label="Codex Claude Antigravity 利用枠残量">
    {SOURCES.map(({ name, match }) => {
      const q = data?.quotas?.find(item => item.provider === match);
      const observedTime = q?.observedAt ? Date.parse(q.observedAt) : NaN;
      const validTime = Number.isFinite(observedTime) && observedTime <= checkedAt + 300_000;
      const ageMinutes = validTime ? (checkedAt - observedTime) / 60_000 : Infinity;
      const fresh = ageMinutes >= 0 && ageMinutes <= 35 && q?.quality !== 'stale' && q?.quality !== 'unavailable';
      const primary = q ? remaining(q.usedPercent, q.remainingPercent) : null;
      const weekly = q ? remaining(q.weeklyUsedPercent, null) : null;
      const hasSample = primary !== null && validTime;
      const displayable = hasSample && ageMinutes <= 24 * 60;
      const status = fresh && hasSample ? (q?.quality === 'estimated' ? '推定' : '実測')
        : hasSample ? '前回値' : '未取得';
      return <article key={name} className={'quota-compact-card ' + (fresh && hasSample ? 'quota-compact-live' : 'quota-compact-unknown')}>
        <div className="quota-compact-title"><strong>{name}</strong><span>{status}</span></div>
        <div className="quota-compact-bottom">
          <div><span>{name === 'Antigravity' ? 'モデル別残量' : '7日間の残量'}</span>
            <strong>{printPercent(displayable ? primary : null)}</strong></div>
          <div><span>{name === 'Antigravity' ? '次回更新' : '7日間の残量'}</span>
            <strong>{name === 'Antigravity' ? (fresh ? '自動' : '—') : printPercent(weekly !== null && displayable ? weekly : null)}</strong></div>
        </div>
        <small>{hasSample ? (fresh ? '最終取得 ' : ageMinutes > 24 * 60 ? '古い観測 ' + printPercent(primary) + ' / ' : '前回 ' ) + new Date(observedTime).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
          : name === 'Antigravity' ? 'IDEの稼働・接続を確認' : '利用枠の記録待ち'}</small>
      </article>;
    })}
  </section>;
}
