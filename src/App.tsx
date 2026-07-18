import { useCallback, useEffect, useMemo, useState } from 'react';
import { fallbackSnapshot } from './sample';
import type { ScheduledTask, TaskSnapshot, TaskStatus } from './types';

const statusLabel: Record<TaskStatus, string> = {
  running: '実行中',
  success: '成功',
  failed: '失敗',
  paused: '停止中',
  scheduled: '待機中',
};

const sourceLabel = {
  local: 'ローカル',
  github: 'GitHub',
  cloudflare: 'Cloudflare',
  other: 'その他',
};

const statusIcon: Record<TaskStatus, string> = {
  running: '▶', success: '✓', failed: '×', paused: 'Ⅱ', scheduled: '◷',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function duration(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value}秒`;
  return `${Math.floor(value / 60)}分${value % 60}秒`;
}

function KpiCard({ tone, label, value, note, icon }: { tone: string; label: string; value: number; note: string; icon: string }) {
  return (
    <article className={`kpi ${tone}`}>
      <div><span className="kpi-label">{label}</span><strong>{value}</strong><small>{note}</small></div>
      <span className="kpi-icon" aria-hidden="true">{icon}</span>
    </article>
  );
}

function TaskRow({ task }: { task: ScheduledTask }) {
  return (
    <tr>
      <td><div className="task-name"><span className={`source-dot ${task.source}`} /> <div><strong>{task.name}</strong><small>{task.environment}</small></div></div></td>
      <td><span className={`status-pill ${task.status}`}>{statusIcon[task.status]} {statusLabel[task.status]}</span></td>
      <td>{task.schedule}</td>
      <td>{formatDate(task.lastRun)}</td>
      <td>{formatDate(task.nextRun)}</td>
      <td>{duration(task.durationSeconds)}</td>
      <td><strong>{task.successRate.toFixed(1)}%</strong></td>
    </tr>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<TaskSnapshot>(fallbackSnapshot);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [source, setSource] = useState<'all' | ScheduledTask['source']>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/data/tasks.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSnapshot(await response.json() as TaskSnapshot);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const totals = useMemo(() => ({
    total: snapshot.tasks.length,
    running: snapshot.tasks.filter((task) => task.status === 'running').length,
    success: snapshot.tasks.filter((task) => task.status === 'success').length,
    failed: snapshot.tasks.filter((task) => task.status === 'failed').length,
  }), [snapshot.tasks]);

  const filtered = useMemo(() => snapshot.tasks.filter((task) => {
    const text = `${task.name} ${task.environment} ${task.schedule}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (status === 'all' || task.status === status) && (source === 'all' || task.source === source);
  }), [query, snapshot.tasks, source, status]);

  const recent = useMemo(() => [...snapshot.tasks].filter((task) => task.lastRun).sort((a, b) => +new Date(b.lastRun!) - +new Date(a.lastRun!)).slice(0, 5), [snapshot.tasks]);
  const upcoming = useMemo(() => [...snapshot.tasks].filter((task) => task.nextRun).sort((a, b) => +new Date(a.nextRun!) - +new Date(b.nextRun!)).slice(0, 5), [snapshot.tasks]);
  const successPercent = totals.total ? Math.round((totals.success / totals.total) * 100) : 0;

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand"><span className="brand-mark">☁</span><div><strong>Task Control</strong><small>Cloud + Local</small></div></div>
        <nav aria-label="メインナビゲーション">
          <a className="active" href="#dashboard">⌂ <span>ダッシュボード</span></a>
          <a href="#tasks">☷ <span>タスク一覧</span></a>
          <a href="#history">◷ <span>実行履歴</span></a>
          <a href="#agents">▣ <span>エージェント</span></a>
          <a href="#setup">⚙ <span>接続設定</span></a>
        </nav>
        <div className="sidebar-foot"><span className="live-dot" /> 60秒ごとに自動更新</div>
      </aside>

      <main>
        <header className="topbar" id="dashboard">
          <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="メニューを開閉">☰</button>
          <div><p className="eyebrow">UNIFIED OPERATIONS</p><h1>クラウド & ローカル定期タスク</h1><p>すべての自動処理を、ひと目で把握。</p></div>
          <div className="header-actions">
            <span className={loadError ? 'data-state warning' : 'data-state'}><i />{loadError ? 'サンプル表示中' : 'データ接続済み'}</span>
            <button className="refresh-button" onClick={() => void load()} disabled={refreshing}>{refreshing ? '更新中…' : '↻ 更新'}</button>
          </div>
        </header>

        <section className="kpi-grid" aria-label="主要指標">
          <KpiCard tone="blue" label="総タスク数" value={totals.total} note={`${snapshot.agents.filter((agent) => agent.status === 'online').length} エージェント接続`} icon="▤" />
          <KpiCard tone="green" label="実行中" value={totals.running} note="リアルタイム監視" icon="▶" />
          <KpiCard tone="orange" label="成功" value={totals.success} note={`成功率 ${successPercent}%`} icon="✓" />
          <KpiCard tone="red" label="要確認" value={totals.failed} note="直近の失敗" icon="!" />
        </section>

        <section className="overview-grid">
          <article className="panel status-panel">
            <div className="panel-heading"><div><span className="section-kicker">OVERVIEW</span><h2>タスク実行状況</h2></div><span className="soft-badge">{snapshot.redacted ? '機密情報を非表示' : '詳細表示'}</span></div>
            <div className="donut-wrap">
              <div className="donut" style={{ '--success': `${successPercent * 3.6}deg`, '--failed': `${(successPercent + (totals.failed / Math.max(totals.total, 1)) * 100) * 3.6}deg` } as React.CSSProperties}><div><strong>{totals.total}</strong><span>合計</span></div></div>
              <div className="legend">
                {(['success', 'failed', 'running', 'paused'] as TaskStatus[]).map((item) => <div key={item}><span className={`legend-dot ${item}`} /><span>{statusLabel[item]}</span><strong>{snapshot.tasks.filter((task) => task.status === item).length}</strong></div>)}
              </div>
            </div>
          </article>

          <article className="panel" id="history">
            <div className="panel-heading"><div><span className="section-kicker">ACTIVITY</span><h2>最近の実行履歴</h2></div></div>
            <div className="activity-list">{recent.map((task) => <div className="activity-item" key={task.id}><span className={`activity-icon ${task.status}`}>{statusIcon[task.status]}</span><div><strong>{task.name}</strong><small>{task.environment}</small></div><span className={`status-text ${task.status}`}>{statusLabel[task.status]}</span><time>{formatDate(task.lastRun)}</time></div>)}</div>
          </article>

          <article className="panel">
            <div className="panel-heading"><div><span className="section-kicker">UP NEXT</span><h2>次回実行予定</h2></div></div>
            <div className="activity-list">{upcoming.map((task) => <div className="activity-item upcoming" key={task.id}><span className="activity-icon scheduled">◷</span><div><strong>{task.name}</strong><small>{task.schedule}</small></div><time>{formatDate(task.nextRun)}</time></div>)}</div>
          </article>
        </section>

        <section className="panel tasks-panel" id="tasks">
          <div className="panel-heading task-heading"><div><span className="section-kicker">ALL TASKS</span><h2>タスク一覧</h2></div><div className="filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タスクを検索" aria-label="タスクを検索" /><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="ステータスで絞り込み"><option value="all">すべての状態</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={source} onChange={(event) => setSource(event.target.value as typeof source)} aria-label="接続元で絞り込み"><option value="all">すべての接続元</option>{Object.entries(sourceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>タスク</th><th>状態</th><th>スケジュール</th><th>最終実行</th><th>次回実行</th><th>所要時間</th><th>成功率</th></tr></thead><tbody>{filtered.map((task) => <TaskRow key={task.id} task={task} />)}</tbody></table>{filtered.length === 0 && <div className="empty-state">条件に一致するタスクはありません。</div>}</div>
        </section>

        <section className="bottom-grid" id="agents">
          <article className="panel agents-panel"><div className="panel-heading"><div><span className="section-kicker">SOURCES</span><h2>接続エージェント</h2></div></div>{snapshot.agents.map((agent) => <div className="agent-row" key={agent.id}><span className={`agent-icon ${agent.status}`}>▣</span><div><strong>{agent.name}</strong><small>{agent.kind}</small></div><span className={`agent-status ${agent.status}`}>{agent.status === 'online' ? 'オンライン' : agent.status === 'offline' ? 'オフライン' : '未接続'}</span><strong>{agent.taskCount}件</strong></div>)}</article>
          <article className="panel setup-panel" id="setup"><div className="panel-heading"><div><span className="section-kicker">QUICK START</span><h2>データ接続</h2></div></div><p>ローカルPCではインストールスクリプトがOSのタスク管理機能へ自動登録します。クラウド側はGitHub Actionsが15分ごとに収集します。</p><div className="setup-steps"><span>1</span><div><strong>ローカルエージェント</strong><small><code>scripts/install-agent.ps1</code> または <code>scripts/install-agent.sh</code></small></div></div><div className="setup-steps"><span>2</span><div><strong>クラウド連携</strong><small>GitHub / Cloudflare用のSecrets名だけを登録</small></div></div><a className="docs-link" href="https://github.com/univcorp2-ctrl/cloud-local-task-dashboard/blob/main/docs/setup.md">設定ガイドを見る →</a></article>
        </section>

        <footer><span>最終スナップショット: {formatDate(snapshot.generatedAt)}</span><span>Task Control Center v1.0</span></footer>
      </main>
      {menuOpen && <button className="backdrop" onClick={() => setMenuOpen(false)} aria-label="メニューを閉じる" />}
    </div>
  );
}
