import { useEffect, useState } from 'react';
import { ageText, fmtJst, toneOf, untilReset, type QuotaView } from './controlState';
import './quota-gauges.css';

const PROVIDER_ORDER: QuotaView['provider'][] = ['claude', 'codex', 'antigravity', 'muse'];
const PROVIDER_SUB: Record<QuotaView['provider'], string> = {
  claude: 'Claude Code / Cowork', codex: 'Codex CLI', antigravity: 'Antigravity', muse: 'Muse', chatgpt: 'ChatGPT',
};

export function Ring({ value, tone, size = 92, stroke = 9, children }: { value: number | null; tone: string; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={`gauge-ring tone-${tone}`} style={{ width: size, height: size }} role="img" aria-label={value === null ? '残量 未取得' : `残量 ${Math.round(value)}%`}>
      <svg viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="xMidYMid meet">
        <circle cx={size / 2} cy={size / 2} r={r} className="gauge-track" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} className="gauge-value" strokeWidth={stroke}
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  );
}

function freshnessLabel(q: QuotaView): { text: string; cls: string } {
  if (q.freshness === 'missing' || !q.primary || q.primary.remainingPercent === null) return { text: '未取得', cls: 'missing' };
  if (q.freshness === 'stale') return { text: `前回値 · ${ageText(q.ageMinutes)}`, cls: 'stale' };
  return { text: `${q.quality === 'measured' ? '実測' : q.quality === 'estimated' ? '推定' : '自己申告'} · ${ageText(q.ageMinutes)}`, cls: 'fresh' };
}

export default function QuotaGauges({ quotas, compact = false, onConnect }: { quotas: QuotaView[] | null; compact?: boolean; onConnect?: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
  const list = PROVIDER_ORDER.map((p) => quotas?.find((q) => q.provider === p) ?? null);
  return (
    <section className={compact ? 'quota-gauges compact' : 'quota-gauges'} aria-label="AI利用枠の残量">
      {list.map((q, i) => {
        const provider = PROVIDER_ORDER[i];
        const primary = q?.primary ?? null;
        const value = q && q.freshness !== 'missing' ? primary?.remainingPercent ?? null : null;
        const tone = toneOf(value);
        const fresh = q ? freshnessLabel(q) : { text: '未取得', cls: 'missing' };
        const reset = value !== null ? untilReset(primary?.resetsAt, now) : { text: 'リセット日 不明', days: null };
        const label = q?.label ?? provider;
        if (compact) {
          return (
            <div className={`gauge-chip tone-${tone}`} key={provider} title={`${label} ${primary?.label ?? ''} ${value === null ? '未取得' : Math.round(value) + '%'} / ${fresh.text} / ${reset.text}`}>
              <Ring value={value} tone={tone} size={40} stroke={5}><strong>{value === null ? '—' : Math.round(value)}</strong></Ring>
              <div className="gauge-chip-text"><span>{label}</span><small>{value === null ? '未取得' : reset.days === null ? fresh.text : reset.days > 0 ? `残${reset.days}日` : '本日リセット'}</small></div>
            </div>
          );
        }
        return (
          <article className={`gauge-card tone-${tone}`} key={provider}>
            <header><strong>{label}</strong><small>{PROVIDER_SUB[provider]}</small></header>
            <div className="gauge-body">
              <Ring value={value} tone={tone}>
                <strong>{value === null ? '—' : Math.round(value)}<i>%</i></strong>
                <span>{primary?.label ?? '残量'}</span>
              </Ring>
              <dl>
                <div><dt>リセット</dt><dd>{value === null ? '—' : <>{reset.text}<small>{primary?.resetsAt ? fmtJst(primary.resetsAt) : ''}</small></>}</dd></div>
                {q?.windows.filter((w) => !primary || w.kind !== primary.kind || w.label !== primary.label).slice(0, 2).map((w) => (
                  <div key={w.kind + w.label}><dt>{w.label}</dt><dd>{w.remainingPercent === null ? '—' : `残${Math.round(w.remainingPercent)}%`}{w.remainingText ? <small>{w.remainingText}</small> : null}</dd></div>
                ))}
                <div><dt>鮮度</dt><dd><span className={`fresh-chip ${fresh.cls}`}>{fresh.text}</span></dd></div>
              </dl>
            </div>
            <footer>{q?.source ? <span title={q.note ?? ''}>{q.source}</span> : <span>データ未接続。PC収集ジョブまたはMCPの set_quota で送信されます。</span>}</footer>
          </article>
        );
      })}
      {!compact && onConnect && (
        <button type="button" className="gauge-connect" onClick={onConnect}>MCP/トークン設定 →</button>
      )}
    </section>
  );
}
