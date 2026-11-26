import { useCallback, useEffect, useMemo, useState } from 'react';
import { authHeaders, useOwnerToken } from './controlState';
import './task-hub.css';

/* ───────── types ───────── */
export type HubTask = {
  id: string; url: string; title: string; category: string; priority: string; status: string; owner: string; executor: string;
  assignedAi?: string; autonomy?: string; due: string | null; nextAction: string; humanAction: string; executionStatus: string;
  order?: number | null; completed: boolean; priorityClass?: string; blocker?: string; urgency?: string; important?: boolean;
  hiroNote?: string; hiroNoteAt?: string | null; lastEditedAt?: string | null; goal?: string; parentIds?: string[];
};
export type HubDeal = {
  id: string; url: string; name: string; stage: string; status: string; rank: string; score: number | null; genre: string; kind: string;
  area: string; station: string; priceMan: number | null; yieldPct: number | null; offerPriceMan: number | null; sale: string; owner: string;
  nextAction: string; due: string | null; risk: string; loan: string; drive: string | null; listing: string | null; lastMemo: string;
  hiroNote: string; hiroNoteAt: string | null; updatedAt: string | null;
};
type Filter = 'all' | 'overdue' | 'soon' | 'hiro' | 'blocked' | 'stale' | 'noNext' | 'note';
type Edit = { nextAction: string; due: string; instruction: string };

/* ───────── Notion links (正本) ───────── */
export const NOTION_LINKS = {
  taskCanon: 'https://app.notion.com/p/5f61a18de1f84eac84ac355126311f8b?v=3f410562e58b815f8aad000ca64c0bc9',
  taskHiro: 'https://app.notion.com/p/5f61a18de1f84eac84ac355126311f8b?v=41610562e58b81078ba5000cc73b9897',
  taskMissed: 'https://app.notion.com/p/5f61a18de1f84eac84ac355126311f8b?v=41610562e58b81139d5c000c446b2d9a',
  deals: 'https://app.notion.com/p/25c2ceb7d2d640f0aceefa790d9ee161',
};

/* ───────── helpers (exported for tests) ───────── */
export const todayJst = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const dayMs = 86_400_000;
export const MAX_CHARS = 1500;
export const DONE_MARK = '✅完了';
/** Date-only values stay as written; date-times are converted to the JST calendar day. */
export function jstDate(due: string | null): string {
  if (!due) return '';
  if (due.length <= 10) return due;
  const t = Date.parse(due);
  return Number.isFinite(t) ? todayJst(new Date(t)) : due.slice(0, 10);
}
export function daysUntil(due: string | null, now = new Date()): number | null {
  if (!due) return null;
  const d = Date.parse(jstDate(due) + 'T00:00:00+09:00');
  const t = Date.parse(todayJst(now) + 'T00:00:00+09:00');
  return Number.isFinite(d) ? Math.round((d - t) / dayMs) : null;
}
export function isHiro(t: HubTask): boolean {
  const ai = t.assignedAi ?? '';
  if (ai.includes('Hiro')) return true;
  return (!ai || ai.includes('未割当')) && t.owner.includes('人間');
}
export const isBlockedTask = (t: HubTask) => /ブロック|エラー/.test(`${t.status} ${t.executionStatus}`);
export const isStale = (iso: string | null | undefined, now = new Date()) => Boolean(iso) && now.getTime() - Date.parse(iso!) > 14 * dayMs;
export const notePending = (note?: string) => Boolean(note && note.trim() && !note.trim().startsWith('対応済'));
export function who(t: HubTask): string {
  if (t.executor === '外部待ち' || /相手待ち/.test(t.status)) return '⏳ 相手待ち';
  if (isHiro(t)) return '👤 Hiro';
  const ai = t.assignedAi ?? '';
  if (ai && !ai.includes('未割当')) return ai;
  return '❓ 担当未定';
}
export function matches(t: HubTask, f: Filter, now = new Date()) {
  const d = daysUntil(t.due, now);
  switch (f) {
    case 'overdue': return d !== null && d < 0;
    case 'soon': return d !== null && d >= 0 && d <= 3;
    case 'hiro': return isHiro(t);
    case 'blocked': return isBlockedTask(t);
    case 'stale': return isStale(t.lastEditedAt, now);
    case 'noNext': return !t.nextAction.trim();
    case 'note': return notePending(t.hiroNote);
    default: return true;
  }
}
const isParent = (t: HubTask) => typeof t.order !== 'number' || Number.isInteger(t.order);
const byOrder = (a: HubTask, b: HubTask) => (a.order ?? 999) - (b.order ?? 999) || (a.due ?? '9999').localeCompare(b.due ?? '9999');
const byDue = (a: HubTask, b: HubTask) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || byOrder(a, b);

/** Child → parent: the Notion 「上位」 relation wins; otherwise the FIRST parent with the same integer 実行順位 (never duplicated). */
export function groupChildren(parents: HubTask[], children: HubTask[]): Map<string, HubTask[]> {
  const out = new Map<string, HubTask[]>();
  for (const c of children) {
    const byRelation = parents.find((p) => c.parentIds?.includes(p.id));
    const byOrderParent = byRelation ? undefined : parents.find((p) => typeof p.order === 'number' && typeof c.order === 'number' && Math.floor(c.order) === p.order);
    const target = byRelation ?? byOrderParent;
    if (target) out.set(target.id, [...(out.get(target.id) ?? []), c]);
  }
  return out;
}

export const BLOCKS = [
  { key: 'hiro', label: '👤 Hiroにしかできないこと', hint: '期限の近い順。ここだけはAIが代われません。', tone: 'hiro' },
  { key: '⓪最重要', label: '⓪ 最重要', hint: '全タスクの中で一番効くもの。', tone: 'zero' },
  { key: '①関所', label: '① 関所（攻めを止めている守り）', hint: 'これが終わると止まっている融資・攻めが動きます。', tone: 'gate' },
  { key: '②攻め', label: '② 攻め（稼ぐ・仕入れる・調達する）', hint: '現金に近いものから。', tone: 'attack' },
  { key: '③守り', label: '③ 守り（期限つきの事務・手続き）', hint: '期限を落とさないように。', tone: 'defense' },
  { key: '④AI裏方', label: '④ AI裏方', hint: 'AIだけで回しているもの。', tone: 'ai', collapsed: true },
  { key: '⑤保留', label: '⑤ 保留', hint: 'リマインド停止中。', tone: 'hold', collapsed: true },
  { key: 'none', label: '🔍 区分なし（振り分け待ち）', hint: 'Notionで「優先区分」が空の行。AIが次の回で振り分けます。忘れ物が混ざりやすい場所です。', tone: 'none', collapsed: true },
] as const;

export function bucketOf(t: HubTask): string {
  const c = t.priorityClass ?? '';
  if (isHiro(t) && c !== '⑤保留') return 'hiro';
  return BLOCKS.some((b) => b.key === c) ? c : 'none';
}

const STAGE_FLOW = ['深掘り済', '資料請求済', '資料受領', '銀行打診', '買付準備', '買付済'];
const STAGE_LABEL: Record<string, string> = { 深掘り済: '詳細調査', 資料請求済: '資料請求', 資料受領: '資料受領', 銀行打診: '銀行打診', 買付準備: '買付準備', 買付済: '買付済' };
const man = (v: number | null) => v === null ? '—' : v >= 10000 ? `${(v / 10000).toFixed(2)}億円` : `${Math.round(v).toLocaleString('ja-JP')}万円`;
const md = (iso: string | null | undefined) => { const v = jstDate(iso ?? null); return v ? `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}` : ''; };
const ago = (iso: string | null | undefined, now = new Date()) => {
  if (!iso) return '';
  const d = Math.floor((now.getTime() - Date.parse(iso)) / dayMs);
  return d <= 0 ? '今日更新' : `${d}日前に更新`;
};

/* ───────── small pieces ───────── */
function DueChip({ due }: { due: string | null }) {
  const d = daysUntil(due);
  if (d === null) return <span className="th-due none">期限なし</span>;
  const cls = d < 0 ? 'over' : d <= 3 ? 'soon' : 'ok';
  const text = d < 0 ? `${md(due)}・${-d}日超過` : d === 0 ? `${md(due)}・今日` : `${md(due)}・あと${d}日`;
  return <span className={`th-due ${cls}`}>{text}</span>;
}

function Editor({ initial, onSave, onCancel, busy, dueLabel }: { initial: Edit; onSave: (e: Edit) => void; onCancel: () => void; busy: boolean; dueLabel: string }) {
  const [v, setV] = useState(initial);
  return <div className="th-editor">
    <label>次の一手（進捗を書き換え）<textarea rows={2} maxLength={MAX_CHARS} value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} /></label>
    <label className="th-editor-due">{dueLabel}<input type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} /></label>
    <label>AIへの指示・メモ（Notionの「Hiro→AI指示」に残り、次の回でAIが対応します）<textarea rows={3} maxLength={MAX_CHARS} placeholder="例：この件は来週火曜に銀行へ持ち込むので資料を一式そろえて" value={v.instruction} onChange={(e) => setV({ ...v, instruction: e.target.value })} /></label>
    <small className="th-editor-count">次の一手 {v.nextAction.length}/{MAX_CHARS}字・指示 {v.instruction.length}/{MAX_CHARS}字</small>
    <div className="th-editor-actions"><button type="button" className="th-btn primary" disabled={busy} onClick={() => onSave(v)}>{busy ? '保存中…' : 'Notionに保存'}</button><button type="button" className="th-btn" onClick={onCancel} disabled={busy}>閉じる</button></div>
  </div>;
}

/* ───────── main ───────── */
export default function TaskHub({ onConnect }: { onConnect: () => void }) {
  const [token] = useOwnerToken();
  const [tasks, setTasks] = useState<HubTask[] | null>(null);
  const [recentDone, setRecentDone] = useState<HubTask[]>([]);
  const [recentFailed, setRecentFailed] = useState(false);
  const [deals, setDeals] = useState<HubDeal[] | null>(null);
  const [dealError, setDealError] = useState('');
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [stage, setStage] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    try {
      const [tr, dr] = await Promise.all([
        fetch('/api/private-tasks?recentDone=7', { headers: authHeaders(), credentials: 'same-origin', cache: 'no-store' }),
        fetch('/api/private-deals', { headers: authHeaders(), credentials: 'same-origin', cache: 'no-store' }),
      ]);
      if (!tr.ok) throw new Error(tr.status === 401 || tr.status === 403 ? 'connect' : tr.status === 503 ? 'Notion接続の設定が未完了です（HTTP 503）' : `タスクを取得できません（HTTP ${tr.status}）`);
      const td = await tr.json() as { tasks?: HubTask[]; recentDone?: HubTask[] | null; truncated?: boolean; generatedAt?: string };
      if (!Array.isArray(td.tasks)) throw new Error('Notionの応答形式が想定と違います');
      setTasks(td.tasks.filter((t) => !t.completed));
      setRecentDone(Array.isArray(td.recentDone) ? td.recentDone : []);
      setRecentFailed(!Array.isArray(td.recentDone));
      setFetchedAt(td.generatedAt ?? new Date().toISOString());
      setError(td.truncated ? 'タスクが多すぎて一部だけ取得しました。件数を全件と見なさないでください。' : '');
      if (dr.ok) { const dd = await dr.json() as { deals?: HubDeal[] }; setDeals(dd.deals ?? []); setDealError(''); }
      else { setDeals(null); setDealError(dr.status === 404 ? 'TCCのNotion連携に統一物件マスターDBの共有がありません（NotionでDBの「接続」にTCCを追加すると表示されます）' : `物件を取得できません（HTTP ${dr.status}）`); }
    } catch (e) { setTasks(null); setDeals(null); setError(e instanceof Error ? e.message : '取得できません'); }
  }, []);
  useEffect(() => { void reload(); const id = window.setInterval(() => void reload(), 120_000); return () => window.clearInterval(id); }, [reload, token]);

  const visible = useMemo(() => (tasks ?? []).filter((t) => matches(t, filter) && (`${t.title} ${t.nextAction} ${t.category} ${t.blocker ?? ''}`).toLowerCase().includes(query.toLowerCase())), [tasks, filter, query]);
  const counts = useMemo(() => {
    const all = tasks ?? [];
    const active = all.filter((t) => !['⑤保留'].includes(t.priorityClass ?? ''));
    const c = (f: Filter) => active.filter((t) => matches(t, f)).length;
    return { overdue: c('overdue'), soon: c('soon'), hiro: c('hiro'), blocked: c('blocked'), stale: c('stale'), noNext: c('noNext'), note: c('note'), total: all.length };
  }, [tasks]);
  const grouped = useMemo(() => {
    const m = new Map<string, HubTask[]>();
    for (const t of visible) { const k = bucketOf(t); m.set(k, [...(m.get(k) ?? []), t]); }
    return m;
  }, [visible]);
  const dealList = useMemo(() => (deals ?? []).filter((d) => stage === 'all' || d.stage === stage)
    .sort((a, b) => STAGE_FLOW.indexOf(b.stage) - STAGE_FLOW.indexOf(a.stage) || (a.due ?? '9999').localeCompare(b.due ?? '9999')), [deals, stage]);

  async function patch(url: string, body: Record<string, unknown>) {
    const r = await fetch(url, { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), credentials: 'same-origin', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Notionに保存できませんでした（HTTP ${r.status}）。画面上も変更していません。`);
    const j = await r.json() as { ok?: boolean; auditLogged?: boolean; nextAction?: string | null };
    if (!j.ok) throw new Error('Notionから保存の確認が返ってきませんでした。');
    return j;
  }
  const auditWarn = (j: { auditLogged?: boolean }) => j.auditLogged === false ? '（保存はできましたが、ページ本文への操作ログ追記は失敗しました）' : '';
  async function completeTask(t: HubTask) {
    if (busy) return;
    setBusy(t.id); setNotice('');
    try {
      const j = await patch('/api/private-tasks', { id: t.id, completed: true });
      setTasks((p) => p?.filter((x) => x.id !== t.id) ?? null);
      setRecentDone((p) => [{ ...t, completed: true, lastEditedAt: new Date().toISOString() }, ...p]);
      setNotice(`「${t.title.slice(0, 30)}」をNotionで完了にしました。${auditWarn(j)}`);
    } catch (e) { setNotice(e instanceof Error ? e.message : '保存失敗'); } finally { setBusy(null); }
  }
  async function saveTask(t: HubTask, e: Edit) {
    setBusy(t.id); setNotice('');
    const body: Record<string, unknown> = { id: t.id };
    if (e.nextAction !== t.nextAction) body.nextAction = e.nextAction;
    if (e.due !== jstDate(t.due)) body.due = e.due || null;
    if (e.instruction.trim()) body.instruction = e.instruction.trim();
    if (Object.keys(body).length === 1) { setBusy(null); setEditing(null); return; }
    try {
      const j = await patch('/api/private-tasks', body);
      setTasks((p) => p?.map((x) => x.id === t.id ? { ...x, nextAction: e.nextAction, due: e.due || null, hiroNote: e.instruction.trim() ? e.instruction.trim() : x.hiroNote, lastEditedAt: new Date().toISOString() } : x) ?? null);
      setEditing(null); setNotice('Notionに保存しました。' + (e.instruction.trim() ? 'AIは次の進捗レポートの回（8・14・20時）で指示を読みます。' : '') + auditWarn(j));
    } catch (err) { setNotice(err instanceof Error ? err.message : '保存失敗'); } finally { setBusy(null); }
  }
  async function dealNextDone(d: HubDeal) {
    if (busy) return;
    setBusy(d.id); setNotice('');
    try {
      const j = await patch('/api/private-deals', { id: d.id, nextDone: true, previousNext: d.nextAction });
      setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, hiroNote: `✅ 次の一手「${d.nextAction}」は完了。次の一手と期限を決めて更新してください。`, nextAction: j.nextAction ?? `${DONE_MARK}：${d.nextAction}`, due: null, updatedAt: new Date().toISOString() } : x) ?? null);
      setNotice(`「${d.name.slice(0, 24)}」の次の一手をNotionで完了にし、AIに次の一手の更新を頼みました。${auditWarn(j)}`);
    } catch (e) { setNotice(e instanceof Error ? e.message : '保存失敗'); } finally { setBusy(null); }
  }
  async function saveDeal(d: HubDeal, e: Edit) {
    setBusy(d.id); setNotice('');
    const body: Record<string, unknown> = { id: d.id };
    if (e.nextAction !== d.nextAction) body.nextAction = e.nextAction;
    if (e.due !== jstDate(d.due)) body.due = e.due || null;
    if (e.instruction.trim()) body.instruction = e.instruction.trim();
    if (Object.keys(body).length === 1) { setBusy(null); setEditing(null); return; }
    try {
      const j = await patch('/api/private-deals', body);
      setDeals((p) => p?.map((x) => x.id === d.id ? { ...x, nextAction: e.nextAction, due: e.due || null, hiroNote: e.instruction.trim() || x.hiroNote, updatedAt: new Date().toISOString() } : x) ?? null);
      setEditing(null); setNotice('Notionに保存しました。' + auditWarn(j));
    } catch (err) { setNotice(err instanceof Error ? err.message : '保存失敗'); } finally { setBusy(null); }
  }

  if (error === 'connect' || (!tasks && !error)) {
    return <section className="task-hub"><div className="th-connect">
      <h2>{error === 'connect' ? 'この端末はまだ接続されていません' : '読み込み中…'}</h2>
      {error === 'connect' && <><p>個人のタスクは公開サイトには出していません。左下の「接続（トークン）」から一度だけ接続すると、Notionのタスクと物件がこの画面に出ます。</p>
        <button type="button" className="th-btn primary" onClick={onConnect}>接続する</button></>}
      <NotionLinks />
    </div></section>;
  }

  const renderTask = (t: HubTask, child = false) => {
    const d = daysUntil(t.due);
    const flags = [
      isBlockedTask(t) && <span key="b" className="th-flag red">⏸ 止まっている</span>,
      !t.nextAction.trim() && <span key="n" className="th-flag amber">次の一手が空</span>,
      isStale(t.lastEditedAt) && <span key="s" className="th-flag gray">14日以上動きなし</span>,
      notePending(t.hiroNote) && <span key="h" className="th-flag blue">📨 AIの対応待ち</span>,
      t.important && <span key="i" className="th-flag pin">📌</span>,
    ].filter(Boolean);
    return <div key={t.id} className={`th-row${child ? ' child' : ''}${d !== null && d < 0 ? ' overdue' : ''}`}>
      <label className="th-check" title="完了にする（Notionに保存）"><input type="checkbox" aria-label={`${t.title}を完了`} checked={busy === t.id} disabled={busy !== null} onChange={(e) => { if (e.target.checked) void completeTask(t); }} /><span /></label>
      <div className="th-main">
        <a className="th-title" href={t.url} target="_blank" rel="noreferrer">{t.title || '無題'}</a>
        <div className="th-next"><b>次の一手</b>{t.nextAction.trim() || '— まだ決まっていません（✏️から書けます）'}</div>
        {t.blocker?.trim() && <div className="th-blocker">これが終わると動く：{t.blocker}</div>}
        {notePending(t.hiroNote) && <div className="th-note">📨 {t.hiroNote!.split('\n')[0]}</div>}
        {flags.length > 0 && <div className="th-flags">{flags}</div>}
      </div>
      <div className="th-side">
        <span className="th-who">{who(t)}</span>
        <DueChip due={t.due} />
        <span className="th-status">{t.status.replace(/^[^\p{L}\p{N}]+/u, '') || '未設定'}</span>
        <small className="th-ago">{ago(t.lastEditedAt)}</small>
        <button type="button" className="th-edit" onClick={() => setEditing(editing === t.id ? null : t.id)}>✏️ 進捗・指示</button>
      </div>
      {editing === t.id && <Editor dueLabel="期限" busy={busy === t.id} initial={{ nextAction: t.nextAction, due: jstDate(t.due), instruction: '' }} onCancel={() => setEditing(null)} onSave={(e) => void saveTask(t, e)} />}
    </div>;
  };

  const renderBlock = (b: typeof BLOCKS[number]) => {
    const items = grouped.get(b.key) ?? [];
    if (!items.length && (b.key === 'none' || filter !== 'all')) return null;
    const parents = b.key === 'hiro' ? [...items].sort(byDue) : items.filter(isParent).sort(byOrder);
    const children = b.key === 'hiro' ? [] : items.filter((t) => !isParent(t));
    const kidsOf = groupChildren(parents, children);
    const placed = new Set([...kidsOf.values()].flat().map((k) => k.id));
    const orphan = children.filter((c) => !placed.has(c.id));
    const over = items.filter((t) => (daysUntil(t.due) ?? 1) < 0).length;
    const blocked = items.filter(isBlockedTask).length;
    const isOpen = open[b.key] ?? !('collapsed' in b && b.collapsed);
    return <section key={b.key} className={`th-block tone-${b.tone}`}>
      <button type="button" className="th-block-head" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [b.key]: !isOpen })}>
        <span className="th-block-title">{b.label}</span>
        <span className="th-block-count">{items.length}件</span>
        {over > 0 && <span className="th-flag red">期限切れ {over}</span>}
        {blocked > 0 && <span className="th-flag gray">止まり {blocked}</span>}
        <span className="th-caret">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && <>
        <p className="th-hint">{b.hint}</p>
        {items.length === 0 ? <div className="th-empty">いまはありません。</div> : <div className="th-rows">
          {parents.map((p) => {
            const kids = (kidsOf.get(p.id) ?? []).sort(byOrder);
            return <div key={p.id} className="th-group">{renderTask(p)}
              {kids.length > 0 && <details className="th-kids"><summary>子タスク {kids.length}件（{kids.filter((k) => (daysUntil(k.due) ?? 1) < 0).length}件 期限切れ）</summary>{kids.map((k) => renderTask(k, true))}</details>}
            </div>;
          })}
          {orphan.map((c) => renderTask(c, true))}
        </div>}
      </>}
    </section>;
  };

  const chip = (f: Filter, label: string, n: number, tone: string) => <button type="button" className={`th-chip ${tone}${filter === f ? ' on' : ''}`} onClick={() => setFilter(filter === f ? 'all' : f)}><strong>{n}</strong><span>{label}</span></button>;

  return <section className="task-hub">
    <div className="th-top">
      <div>
        <h2>いま、何が進んでいて、次に何をやるか</h2>
        <p>Notionの正本（マスタータスクDB・統一物件マスターDB）をそのまま表示。左のチェックで完了、✏️で次の一手・期限・AIへの指示をNotionに書き込めます。</p>
      </div>
      <div className="th-top-side"><button type="button" className="th-btn" onClick={() => void reload()}>↻ 更新</button><small>{fetchedAt ? `取得 ${new Date(fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}・2分ごと自動` : ''}</small></div>
    </div>
    {error && <p role="alert" className="th-alert">{error}</p>}
    {notice && <p role="status" className="th-notice">{notice}</p>}

    <div className="th-chips" aria-label="忘れ物チェック">
      {chip('overdue', '期限切れ', counts.overdue, 'red')}
      {chip('soon', '3日以内が期限', counts.soon, 'orange')}
      {chip('hiro', 'Hiroの一手', counts.hiro, 'hiro')}
      {chip('blocked', '止まっている', counts.blocked, 'gray')}
      {chip('noNext', '次の一手が空', counts.noNext, 'amber')}
      {chip('stale', '14日以上動きなし', counts.stale, 'gray')}
      {chip('note', 'AIの対応待ち指示', counts.note, 'blue')}
      <div className="th-chip done"><strong>{recentFailed ? '—' : recentDone.length}</strong><span>{recentFailed ? '完了件数を取得できず' : 'この7日で完了'}</span></div>
    </div>

    <section className="th-block tone-deal">
      <div className="th-block-head static"><span className="th-block-title">🏠 進行中の物件（買付・詳細調査）</span><span className="th-block-count">{deals ? `${deals.length}件` : ''}</span><a href={NOTION_LINKS.deals} target="_blank" rel="noreferrer">Notionで開く ↗</a></div>
      {dealError ? <p className="th-alert soft">{dealError}</p> : !deals ? <div className="th-empty">読み込み中…</div> : <>
        <div className="th-stages">
          <button type="button" className={stage === 'all' ? 'on' : ''} onClick={() => setStage('all')}>すべて <b>{deals.length}</b></button>
          {[...STAGE_FLOW].reverse().map((s) => <button key={s} type="button" className={stage === s ? 'on' : ''} onClick={() => setStage(stage === s ? 'all' : s)}>{STAGE_LABEL[s]} <b>{deals.filter((d) => d.stage === s).length}</b></button>)}
        </div>
        {dealList.length === 0 ? <div className="th-empty">この段階の物件はありません。</div> : <div className="th-rows">{dealList.map((d) => {
          const idx = STAGE_FLOW.indexOf(d.stage);
          return <div key={d.id} className={`th-row deal${(daysUntil(d.due) ?? 1) < 0 ? ' overdue' : ''}`}>
            <label className="th-check" title="次の一手を完了にする（AIが次の一手を更新）"><input type="checkbox" aria-label={`${d.name}の次の一手を完了`} checked={busy === d.id} disabled={busy !== null || !d.nextAction.trim() || d.nextAction.startsWith(DONE_MARK)} onChange={(e) => { if (e.target.checked) void dealNextDone(d); }} /><span /></label>
            <div className="th-main">
              <a className="th-title" href={d.url} target="_blank" rel="noreferrer">{d.name || '名称未設定'}</a>
              <div className="th-stepper" aria-label={`段階：${d.stage}`}>{STAGE_FLOW.map((s, i) => <span key={s} className={i < idx ? 'past' : i === idx ? 'now' : ''}>{STAGE_LABEL[s]}</span>)}</div>
              <div className="th-facts">{[d.station || d.area, d.priceMan !== null ? man(d.priceMan) : '', d.yieldPct !== null ? `表面${d.yieldPct}%` : '', d.rank ? `ランク${d.rank}` : '', d.score !== null ? `${Math.round(d.score)}点` : '', d.sale].filter(Boolean).join('・')}</div>
              <div className="th-next"><b>次の一手</b>{d.nextAction.trim() || '— まだ決まっていません（✏️から書けます）'}</div>
              {d.lastMemo && <div className="th-memo">直近：{d.lastMemo}</div>}
              {notePending(d.hiroNote) && <div className="th-note">📨 {d.hiroNote.split('\n')[0]}</div>}
              <div className="th-links">{d.drive && <a href={d.drive} target="_blank" rel="noreferrer">資料フォルダ ↗</a>}{d.listing && <a href={d.listing} target="_blank" rel="noreferrer">掲載元 ↗</a>}</div>
            </div>
            <div className="th-side">
              <span className="th-who">{d.owner ? (d.owner === 'Hiro' ? '👤 Hiro' : `🤖 ${d.owner}`) : '❓ 担当未定'}</span>
              <DueChip due={d.due} />
              <span className="th-status">{STAGE_LABEL[d.stage] ?? d.stage}</span>
              <small className="th-ago">{ago(d.updatedAt)}</small>
              <button type="button" className="th-edit" onClick={() => setEditing(editing === d.id ? null : d.id)}>✏️ 進捗・指示</button>
            </div>
            {editing === d.id && <Editor dueLabel="次の一手の期限" busy={busy === d.id} initial={{ nextAction: d.nextAction, due: jstDate(d.due), instruction: '' }} onCancel={() => setEditing(null)} onSave={(e) => void saveDeal(d, e)} />}
          </div>;
        })}</div>}
      </>}
    </section>

    <div className="th-search"><input aria-label="タスクを検索" placeholder="タスク・次の一手を検索" value={query} onChange={(e) => setQuery(e.target.value)} />{filter !== 'all' && <button type="button" className="th-btn" onClick={() => setFilter('all')}>絞り込みを外す</button>}<span>{counts.total}件（未完了）</span></div>
    {BLOCKS.map(renderBlock)}

    <details className="th-block tone-done"><summary className="th-block-head"><span className="th-block-title">✅ この7日で終わったこと</span><span className="th-block-count">{recentFailed ? '取得失敗' : `${recentDone.length}件`}</span></summary>
      <p className="th-hint">完了済みで、最後の更新が7日以内の行（最大100件）。</p>
      <div className="th-rows">{recentDone.map((t) => <div key={t.id} className="th-row done"><span className="th-check done-mark">✓</span><div className="th-main"><a className="th-title" href={t.url} target="_blank" rel="noreferrer">{t.title}</a></div><div className="th-side"><span className="th-who">{who(t)}</span><small className="th-ago">{ago(t.lastEditedAt)}</small></div></div>)}</div>
    </details>
    <NotionLinks />
  </section>;
}

function NotionLinks() {
  return <div className="th-notion">
    <strong>Notionで見る（同じデータ）</strong>
    <a href={NOTION_LINKS.taskCanon} target="_blank" rel="noreferrer">🎯 タスク即答｜正本 ↗</a>
    <a href={NOTION_LINKS.taskHiro} target="_blank" rel="noreferrer">👤 Hiroがやる ↗</a>
    <a href={NOTION_LINKS.taskMissed} target="_blank" rel="noreferrer">🚨 取りこぼし防止 ↗</a>
    <a href={NOTION_LINKS.deals} target="_blank" rel="noreferrer">🏠 統一物件マスターDB ↗</a>
  </div>;
}
