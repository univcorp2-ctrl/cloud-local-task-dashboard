import { useCallback, useEffect, useMemo, useState } from 'react';

type Task = { id: string; url: string; title: string; category: string; priority: string; status: string;
  owner: string; executor: string; due: string | null; nextAction: string; humanAction: string };
type Mode = 'list' | 'board';
const notion = 'https://www.notion.so/5f61a18de1f84eac84ac355126311f8b';
const views = [
  { label: '10領域別・未完了', url: notion + '?v=3fe10562e58b811c8743000cd773607c' },
  { label: '本人対応', url: notion + '?v=3fe10562e58b81e9bb57000c9c0cef2b' },
  { label: 'AI担当', url: notion + '?v=3fe10562e58b81c99413000c3823cb61' },
];
const categories = ['🏠 不動産・民泊', '🏦 銀行・融資・補助金', '🧾 確定申告・経理', '⚙️ AI開発・自動化',
  '📦 物販・買取', '🤝 営業・連絡', '📝 事務・生活', '🎯 経営・戦略', '📚 調査・学習', '🔍 要確認'];
const rank = (s: string) => s.includes('最高') ? 0 : s.includes('高') ? 1 : s.includes('中') ? 2 : 3;
const isHuman = (t: Task) => (t.owner.includes('人間') || t.owner.includes('両方')) || t.executor === 'Hiro' || Boolean(t.humanAction);
const isAI = (t: Task) => t.owner.includes('AI') || ['CLIエージェント', 'ChatGPT追撃', '自動調査'].includes(t.executor);
const safeDue = (value: string | null) => value ? value.slice(0, 10) : '期限なし';

export default function ManualTasksPanel() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [message, setMessage] = useState('読み込み中');
  const [category, setCategory] = useState('すべて');
  const [lane, setLane] = useState('すべて');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<Mode>('list');
  const [view, setView] = useState<'open' | 'completed'>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [doneIds, setDoneIds] = useState<string[]>([]);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/private-tasks?status=' + view, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.status === 503 ? '認証・Notion連携が未設定です' : '認証が必要、または取得できません');
      const data = await response.json() as { tasks?: Task[]; truncated?: boolean };
      if (!Array.isArray(data.tasks)) throw new Error('不正な応答');
      setTasks(data.tasks);
      setDoneIds([]);
      setMessage(data.truncated ? '一部のタスクのみ取得' : 'Notionと接続済み');
    } catch (err) {
      setTasks(null);
      setMessage(err instanceof Error ? err.message : '取得できません');
    }
  }, [view]);
  useEffect(() => { void reload(); }, [reload]);
  const visibleCategories = useMemo(() => ['すべて', ...new Set([ ...categories, ...(tasks ?? []).map(t => t.category || '🔍 要確認')])], [tasks]);
  const filtered = useMemo(() => (tasks ?? []).filter(t =>
    !doneIds.includes(t.id) &&
    (category === 'すべて' || (t.category || '🔍 要確認') === category) &&
    (lane === 'すべて' || (lane === '本人対応' && isHuman(t)) || (lane === 'AI担当' && isAI(t))) &&
    (t.title + ' ' + t.nextAction + ' ' + t.category).toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => rank(a.priority) - rank(b.priority) ||
    (a.due || '9999').localeCompare(b.due || '9999')), [tasks, category, lane, search, doneIds]);

  async function complete(task: Task, checked: boolean) {
    if (busy || checked === (view === 'completed')) return;
    setBusy(task.id);
    setError('');
    try {
      const response = await fetch('/api/private-tasks', {
        method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, completed: checked }),
      });
      if (!response.ok) throw new Error('Notionへの変更保存に失敗しました（' + response.status + '）。');
      const result = await response.json() as {ok?:boolean; auditLogged?:boolean};
      if (result.ok !== true) throw new Error('Notionへの保存確認ができませんでした。');
      setDoneIds(prev => [...prev, task.id]);
      if (result.auditLogged === false) setError('Notionの完了状態は更新されましたが、履歴ログの追記に失敗しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '完了処理失敗');
    } finally {
      setBusy(null);
    }
  }
  const renderTask = (task: Task) => <div className="work-task-content" key={task.id}>
    <label className="work-tick" title={view === 'completed' ? '未完了に戻す' : 'Notionに完了を保存'}><input type="checkbox" checked={view === 'completed'} aria-label={task.title + (view === 'completed' ? 'を未完了に戻す' : 'を完了')} disabled={busy !== null} onChange={e => void complete(task, e.target.checked)} /><span /></label>
    <div className="work-task-copy"><a href={task.url} target="_blank" rel="noreferrer" className="work-task-title">{task.title || '無題'} ↗</a>
      <small>{task.priority}　{safeDue(task.due)}　{task.owner}</small></div>
  </div>;

  return <section className="work-dashboard" id="my-tasks">
    <div className="work-compact-header"><strong>タスク一覧</strong><span>{tasks ? filtered.length + '件（' + (view === 'completed' ? '完了済み' : '未完了') + '）' : message}</span>
      <div className="work-view" role="group" aria-label="完了状態の切り替え"><button type="button" className={view==='open'?'selected':''} aria-pressed={view==='open'} onClick={()=>setView('open')}>未完了</button><button type="button" className={view==='completed'?'selected':''} aria-pressed={view==='completed'} onClick={()=>setView('completed')}>完了済み・復元</button></div>
      <button className="refresh-button" type="button" onClick={() => void reload()}>↻</button>
      <div className="work-mode" role="group" aria-label="表示形式"><button type="button" aria-pressed={mode === 'list'} className={mode === 'list' ? 'selected' : ''} onClick={() => setMode('list')}>☷ 一覧</button>
        <button type="button" aria-pressed={mode === 'board'} className={mode === 'board' ? 'selected' : ''} onClick={() => setMode('board')}>▦ カンバン</button></div>
    </div>
    <div className="work-toolbar">
      <select aria-label="担当で絞り込み" value={lane} onChange={e => setLane(e.target.value)}>{['すべて', '本人対応', 'AI担当'].map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="カテゴリで絞り込み" value={category} onChange={e => setCategory(e.target.value)}>{visibleCategories.map(x => <option key={x}>{x}</option>)}</select>
      <input aria-label="タスク検索" placeholder="タスクを検索" value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    {error && <p role="alert" className="usage-error">{error}</p>}
    {tasks ? (mode === 'list' ? <div className="work-table-scroll"><table className="work-dense-table"><thead><tr><th>{view === 'completed' ? '復元' : '完了'}</th><th>タスク</th><th>カテゴリ</th><th>重要度</th><th>担当</th><th>期日</th></tr></thead>
      <tbody>{filtered.map(t => <tr key={t.id}><td><input type="checkbox" checked={view === 'completed'} aria-label={t.title + (view === 'completed' ? 'を未完了に戻す' : 'を完了')} disabled={busy !== null} onChange={e => void complete(t, e.target.checked)} /></td>
        <td><a href={t.url} target="_blank" rel="noreferrer">{t.title || '無題'} ↗</a></td><td>{t.category || '🔍 要確認'}</td><td>{t.priority}</td><td>{t.owner}</td><td>{safeDue(t.due)}</td></tr>)}</tbody></table>
      {!filtered.length && <div className="empty-state">条件に合うタスクはありません。</div>}</div>
      : <div className="work-kanban-scroll"><div className="work-kanban">{visibleCategories.filter(c => c !== 'すべて' && (category === 'すべて' || category === c)).map(c => {
        const items = filtered.filter(t => (t.category || '🔍 要確認') === c);
        return <section className="work-kanban-col" key={c}><h3>{c} <span>{items.length}</span></h3><div className="work-kanban-items">
          {items.map(renderTask)}</div></section>;
      })}</div></div>)
      : <div className="work-private"><strong>現在の公開画面にはNotionを編集する認証がありません。</strong>
        <p>チェック操作はCloudflare Access認証とNotion連携が有効な場合のみ利用できます。公開ページから保護を回避しません。Notionのタスク一覧で直接完了操作できます。</p>
        <div className="work-links">{views.map(v => <a key={v.label} href={v.url} target="_blank" rel="noreferrer">{v.label} ↗</a>)}</div>
        <div className="work-unconnected-categories">{categories.map(c => <span key={c}>{c}</span>)}</div></div>}
    {tasks && <div className="work-footer-links">{views.map(v => <a key={v.label} href={v.url} target="_blank" rel="noreferrer">{v.label} ↗</a>)}</div>}
  </section>;
}
