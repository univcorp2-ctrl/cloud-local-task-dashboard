import { useCallback, useEffect, useMemo, useState } from 'react';

type Window = '24h' | '7d' | '30d';
type Task = {
  id: string; name: string; executor: string; model: string; status: string;
  tokens: Record<Window, number | null>;
  lastRunAt?: string | null;
  repoVisibility?: 'private' | 'public' | 'unknown';
  repository?: string | null;
};
type Snapshot = {
  generatedAt: string; total30d: number | null; period: string;
  monitoredTaskCount: number; measuredTaskCount: number;
  tasks: Task[]; coverageNote: string;
};
const fmt = (n: number | null) => n === null ? '未取得' : n.toLocaleString('ja-JP');
const percent = (n: number, total: number) => total > 0 ? 100 * n / total : 0;
const displayPercent = (n: number) => n === 100 ? '100%' : n >= 10 ? n.toFixed(1) + '%' : n > 0 ? n.toFixed(2) + '%' : '0%';
const options: Array<{ value: Window; label: string }> = [
  { value: '24h', label: '24時間' }, { value: '7d', label: '7日' }, { value: '30d', label: '30日' },
];

function isSnapshot(v: unknown): v is Snapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<Snapshot>;
  return Array.isArray(o.tasks) && typeof o.generatedAt === 'string' &&
    (o.total30d === null || typeof o.total30d === 'number');
}

export default function TokenUsagePanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [period, setPeriod] = useState<Window>('30d');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/token-usage', { cache: 'no-store' });
      if (!r.ok) throw Error('source-unavailable');
      const body: unknown = await r.json();
      if (!isSnapshot(body)) throw Error('invalid-source');
      setData(body); setError('');
    } catch {
      setError('計測データを取得できません。根拠のない使用率は表示しません。');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const handle = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(handle);
  }, [load]);

  const breakdown = useMemo(() => {
    const source = data?.tasks ?? [];
    const known = source.filter(t => typeof t.tokens[period] === 'number' && (t.tokens[period] ?? 0) > 0)
      .sort((a, b) => (b.tokens[period] ?? 0) - (a.tokens[period] ?? 0));
    const others = source.filter(t => t.tokens[period] === null || t.tokens[period] === 0);
    const knownSum = known.reduce((sum, t) => sum + (t.tokens[period] ?? 0), 0);
    const upstreamTotal = period === '30d' ? data?.total30d : null;
    const total = upstreamTotal !== null && upstreamTotal !== undefined && upstreamTotal >= knownSum
      ? upstreamTotal : knownSum;
    return { known, others, knownSum, total, unattributed: Math.max(0, total - knownSum) };
  }, [data, period]);

  const leader = breakdown.known[0];
  const leaderShare = leader ? percent(leader.tokens[period] ?? 0, breakdown.total) : 0;

  return <section className="panel spend-panel" id="token-usage" aria-label="自動化タスクのトークン消費ランキング">
    <div className="spend-heading">
      <div><span className="section-kicker">AUTOMATION COST CONCENTRATION</span><h2>自動化のトークン消費ランキング</h2></div>
      <div className="spend-period" role="group" aria-label="消費量の集計期間">
        {options.map(o => <button key={o.value} type="button" aria-pressed={o.value === period} className={o.value === period ? 'selected' : ''} onClick={() => setPeriod(o.value)}>{o.label}</button>)}
      </div>
    </div>
    <div className="spend-summary">
      <div className="spend-leader"><span>最も消費している処理</span>
        <strong>{leader?.name || '計測なし'}</strong>
        <small>計測されたトークンの <b>{leader ? displayPercent(leaderShare) : '—'}</b> を使用</small></div>
      <div className="spend-big"><span>集計された総トークン</span><strong>{fmt(breakdown.total)}</strong><small>{period}・連携済み処理に限る</small></div>
      <div className="spend-coverage"><span>計測範囲</span><strong>{breakdown.known.length}<small> / {data?.monitoredTaskCount ?? '—'} 処理</small></strong><small>PC定期タスク全件との突合は未完了</small></div>
    </div>
    {error && <p role="alert" className="usage-error">{error}</p>}
    {!data && !error && <p className="usage-empty">計測結果を取得中…</p>}
    {data && <div className="spend-scroll" role="region" aria-label="トークン使用率と全体比率">
      <table className="spend-table">
        <thead><tr><th>順位・実行処理</th><th>使用トークン</th><th>計測内シェア</th><th>最終実行</th></tr></thead>
        <tbody>
          {breakdown.known.map((task, i) => {
            const share = percent(task.tokens[period] ?? 0, breakdown.total);
            return <tr key={task.id}>
              <td><span className="spend-rank">{i + 1}</span><strong>{task.name || task.id}</strong>
                <small>{task.repository ? 'リポ: ' + task.repository : task.repoVisibility === 'private' ? 'リポ非公開' : 'リポとの紐付け未確認'}</small></td>
              <td className="spend-tokens">{fmt(task.tokens[period])}</td>
              <td className="spend-share"><strong>{displayPercent(share)}</strong><div className="spend-track"><span style={{ width: share + '%' }} /></div></td>
              <td className="spend-date">{task.lastRunAt ? new Date(task.lastRunAt).toLocaleDateString('ja-JP') : '未取得'}</td>
            </tr>;
          })}
          {breakdown.unattributed > 0 && <tr className="spend-unattributed">
            <td><strong>帰属未特定</strong><small>集計合計とタスク別計測との差分</small></td>
            <td className="spend-tokens">{fmt(breakdown.unattributed)}</td>
            <td className="spend-share"><strong>{displayPercent(percent(breakdown.unattributed, breakdown.total))}</strong></td><td>—</td>
          </tr>}
          {breakdown.others.map(task => <tr className="spend-no-data" key={task.id}>
            <td><strong>{task.name || task.id}</strong><small>トークン計測の確認待ち</small></td>
            <td>記録なし</td><td>—</td><td className="spend-date">{task.lastRunAt ? new Date(task.lastRunAt).toLocaleDateString('ja-JP') : '未取得'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}
    {data && <div className="spend-footnote">
      シェアの分母は連携済み処理で計測されたトークンのみ。 全リポジトリ・全定期タスクの消費率ではありません。記録なしは使用量ゼロの証明ではありません。
      <span>最終更新 {new Date(data.generatedAt).toLocaleString('ja-JP')} {loading ? '・更新中' : ''}</span>
    </div>}
  </section>;
}
