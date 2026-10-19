import { useCallback, useEffect, useMemo, useState } from 'react';

type Period = '24h' | '7d' | '30d';
interface TokenTask {
  id: string;
  name: string;
  executor: string;
  model: string;
  status: string;
  tokens: Record<Period, number | null>;
}
interface TokenSnapshot {
  generatedAt: string;
  total30d: number | null;
  period: string;
  measuredTaskCount: number;
  monitoredTaskCount: number;
  tasks: TokenTask[];
  coverageNote: string;
}
const periods: Period[] = ['24h', '7d', '30d'];
const format = (value: number | null) => value === null ? '計測なし' : value.toLocaleString('ja-JP');
const validSnapshot = (value: unknown): value is TokenSnapshot => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TokenSnapshot>;
  return Array.isArray(item.tasks) && typeof item.generatedAt === 'string' &&
    (item.total30d === null || typeof item.total30d === 'number');
};

export default function TokenUsagePanel() {
  const [snapshot, setSnapshot] = useState<TokenSnapshot | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/token-usage', { cache: 'no-store' });
      if (!response.ok) throw new Error('usage unavailable');
      const result: unknown = await response.json();
      if (!validSnapshot(result)) throw new Error('invalid usage format');
      setSnapshot(result);
      setError('');
    } catch {
      setError('トークン集計の取得に失敗しました。前回取得値の有無を確認してください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const total = useMemo(() => {
    if (!snapshot) return null;
    if (period === '30d') return snapshot.total30d;
    const values = snapshot.tasks.map((task) => task.tokens[period]).filter((n): n is number => typeof n === 'number');
    return values.length ? values.reduce((sum, n) => sum + n, 0) : null;
  }, [period, snapshot]);
  const ranked = useMemo(() => snapshot?.tasks.slice().sort((a, b) =>
    (b.tokens[period] ?? -1) - (a.tokens[period] ?? -1)) ?? [], [period, snapshot]);

  return (
    <section className="panel usage-panel" id="token-usage" aria-label="AIトークン消費量">
      <div className="panel-heading usage-heading">
        <div><span className="section-kicker">AI RESOURCE USAGE</span><h2>AIトークン消費量</h2></div>
        <div className="usage-actions">
          <div className="usage-periods" aria-label="集計期間">
            {periods.map((option) => <button key={option} type="button"
              aria-pressed={period === option} className={period === option ? 'selected' : ''}
              onClick={() => setPeriod(option)}>{option === '24h' ? '24時間' : option === '7d' ? '7日間' : '30日間'}</button>)}
          </div>
          <button type="button" className="refresh-button" onClick={() => void load()} disabled={loading}>{loading ? '取得中' : '更新'}</button>
        </div>
      </div>
      <div className="usage-kpis">
        <div><small>記録済みトークン / {period}</small><strong>{format(total)}</strong><span>実測ログベース・請求額ではありません</span></div>
        <div><small>AI業務の監視対象</small><strong>{snapshot ? snapshot.monitoredTaskCount : '—'} 件</strong><span>Windowsタスク全件ではありません</span></div>
        <div><small>30日間の計測あり</small><strong>{snapshot ? snapshot.measuredTaskCount : '—'} 件</strong><span>0表示は実際の不使用を証明しません</span></div>
      </div>
      {error && <p role="alert" className="usage-error">{error}</p>}
      {!snapshot && <p className="usage-empty">データ未取得。架空のサンプル値は表示しません。</p>}
      {snapshot && <>
        <div className="usage-table-wrap"><table>
          <thead><tr><th>AI業務</th><th>モデル</th><th>実行者</th><th>状態（収集時）</th><th>{period} トークン</th></tr></thead>
          <tbody>{ranked.map((task) => <tr key={task.id}>
            <td><strong>{task.name || task.id}</strong></td>
            <td>{task.model || '未取得'}</td>
            <td>{task.executor || '未取得'}</td>
            <td>{task.status || '未取得'}</td>
            <td><strong>{format(task.tokens[period])}</strong></td>
          </tr>)}</tbody>
        </table></div>
        <p className="usage-provenance">
          取得元：<a href="https://ai-operations-state.univcorp2.workers.dev/v1/snapshot/latest" target="_blank" rel="noreferrer">Cloudflare AI Operations State</a>
          {' ・ '}集計更新：{snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString('ja-JP') : '不明'}
          {' ・ '}対象：Workerで関連付け済みのAI業務のみ。未収集のChatGPT / Claude / API / 他PCの使用量は含みません。
          30日間の総量はWorkerの公式集計フィールドを使用。24時間・7日間はこの一覧の計測可能行のみの合算です。
          APIの実請求額・モデル別単価は確認できないため費用を推計表示しません。
        </p>
      </>}
    </section>
  );
}
