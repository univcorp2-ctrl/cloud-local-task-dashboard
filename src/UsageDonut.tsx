import { useMemo } from 'react';

export interface Slice { id: string; label: string; tokens: number }
const colors = ['#2b68da','#18a4a6','#e49d38','#8363cf','#b65e80','#678aa4'];
const pretty = (n: number) => n >= 10 ? n.toFixed(1) + '%' : n > 0 ? n.toFixed(2) + '%' : '0%';
export default function UsageDonut({ slices, total, coverage }: { slices: Slice[]; total: number; coverage: string }) {
  const groups = useMemo(() => {
    const top = slices.slice(0, 5).map(s => ({ ...s }));
    const others = slices.slice(5).reduce((sum, item) => sum + item.tokens, 0);
    if (others > 0) top.push({ id: 'others', label: 'その他の計測処理', tokens: others });
    return top;
  }, [slices]);
  const circumference = 2 * Math.PI * 39;
  let offset = 0;
  const segments = groups.map((slice, index) => {
    const size = total > 0 ? Math.max(0, slice.tokens / total) : 0;
    const dash = Math.min(circumference, circumference * size);
    const segment = <circle key={slice.id} cx="50" cy="50" r="39" fill="none"
      stroke={colors[index % colors.length]} strokeWidth="16"
      strokeDasharray={`${dash} ${circumference - dash}`}
      strokeDashoffset={-offset} transform="rotate(-90 50 50)">
      <title>{slice.label}：{slice.tokens.toLocaleString('ja-JP')}トークン（計測内 {pretty(size * 100)}）</title>
    </circle>;
    offset += dash;
    return segment;
  });
  return <section className="spend-donut-panel" aria-label="処理別トークン消費構成の円グラフ">
    <div className="spend-donut-title"><strong>処理別の消費構成</strong><span>計測された範囲</span></div>
    <div className="spend-donut-layout">
      <div className="spend-donut-image">
        <svg viewBox="0 0 100 100" role="img" aria-label="計測済みトークンの処理別構成比">
          <circle cx="50" cy="50" r="39" fill="none" stroke="#e8edf4" strokeWidth="16"/>
          {segments}
          <text x="50" y="47" textAnchor="middle" fontSize="9" fontWeight="700" fill="#334155">計測内</text>
          <text x="50" y="59" textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d4ed8">{total > 0 ? '100%' : '—'}</text>
        </svg>
      </div>
      <div className="spend-donut-legend">
        {groups.slice(0, 5).map((slice, index) => <div className="spend-legend-row" key={slice.id}>
          <span className="spend-legend-dot" style={{ background: colors[index % colors.length] }} />
          <span className="spend-legend-name" title={slice.label}>{slice.label}</span>
          <strong>{total ? pretty(slice.tokens / total * 100) : '—'}</strong>
        </div>)}
        {!groups.length && <p>トークン計測データなし</p>}
      </div>
    </div>
    <p className="spend-donut-note">{coverage}。未計測のタスクは割合に含まれません。</p>
  </section>;
}
