/**
 * Notion master-task access used by /api/private-tasks and the MCP server.
 * The integration token never leaves the server; callers receive only task metadata.
 */
export interface NotionEnv { NOTION_API_TOKEN?: string; NOTION_DATA_SOURCE_ID?: string }
export const ALLOWED_DATABASE = '5f61a18de1f84eac84ac355126311f8b';
const DONE_STATUSES = ['✅ 完了', '完了', '🟢 完了'];

interface NotionPage {
  id: string;
  url: string;
  last_edited_time?: string;
  properties: Record<string, {
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name: string } | null;
    checkbox?: boolean;
    number?: number | null;
    date?: { start: string } | null;
    url?: string | null;
    relation?: Array<{ id: string }>;
  }>;
}
export interface PrivateTask {
  id: string; url: string; title: string; category: string; priority: string; status: string;
  owner: string; executor: string; assignedAi: string; autonomy: string; due: string | null;
  nextAction: string; humanAction: string; whyHuman: string; executionStatus: string;
  cashDistance: string; order: number | null; completed: boolean;
  goal?: string; doneCriteria?: string; wbsSummary?: string;
  evidenceUrl?: string | null; freshness?: string; linkStatus?: string; lastEditedAt?: string | null;
  priorityClass?: string; blocker?: string; urgency?: string; important?: boolean; archived?: boolean;
  memo?: string; hiroNote?: string; hiroNoteAt?: string | null; parentIds?: string[];
}
export interface TaskListResult { generatedAt: string; source: 'Notion'; truncated: boolean; showCompleted: boolean; tasks: PrivateTask[] }
export class NotionError extends Error { constructor(public code: string, public status: number) { super(code); } }

const titleOf = (page: NotionPage, name: string) =>
  (page.properties[name]?.title ?? page.properties[name]?.rich_text ?? []).map((p) => p.plain_text ?? '').join('');
const optionOf = (page: NotionPage, name: string) => page.properties[name]?.select?.name ?? '';

export function notionConfig(env: NotionEnv): { token: string; dataSourceId: string } {
  const token = env.NOTION_API_TOKEN?.trim();
  const dataSourceId = env.NOTION_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId)) throw new NotionError('notion_not_configured', 503);
  return { token, dataSourceId };
}

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Notion-Version': '2025-09-03',
  'Content-Type': 'application/json',
});

export function toTask(page: NotionPage): PrivateTask {
  const status = optionOf(page, 'ステータス');
  return {
    id: page.id,
    url: page.url,
    title: titleOf(page, 'タスク名'),
    category: optionOf(page, '統合カテゴリ') || '🔍 要確認',
    priority: optionOf(page, '優先度') || '未設定',
    status: status || '未設定',
    owner: optionOf(page, '担当') || '未設定',
    executor: optionOf(page, '実行レーン') || '未設定',
    assignedAi: optionOf(page, '担当AI') || '⏳ 未割当',
    autonomy: optionOf(page, '自律実行') || '未設定',
    due: page.properties['期日']?.date?.start ?? page.properties['期限']?.date?.start ?? null,
    nextAction: titleOf(page, '次の一手'),
    humanAction: titleOf(page, '人間がやること'),
    whyHuman: optionOf(page, 'なぜHiroだけ'),
    executionStatus: optionOf(page, '実行状況') || '未設定',
    cashDistance: optionOf(page, '現金化距離'),
    order: typeof page.properties['実行順位']?.number === 'number' ? page.properties['実行順位']!.number : null,
    goal: titleOf(page, '目的・ゴール'),
    doneCriteria: titleOf(page, '完了条件'),
    wbsSummary: titleOf(page, 'WBSサマリー'),
    evidenceUrl: page.properties['実装正本URL']?.url ?? page.properties['元タスクリンク']?.url ?? null,
    freshness: optionOf(page, '情報鮮度') || '要確認',
    linkStatus: optionOf(page, '連携状態') || '未照合',
    lastEditedAt: page.last_edited_time ?? null,
    priorityClass: optionOf(page, '優先区分'),
    blocker: titleOf(page, '止めている先'),
    urgency: optionOf(page, '緊急度'),
    important: Boolean(page.properties['📌重要タスク']?.checkbox),
    archived: Boolean(page.properties['アーカイブ']?.checkbox),
    memo: titleOf(page, 'メモ'),
    hiroNote: titleOf(page, 'Hiro→AI指示'),
    hiroNoteAt: page.properties['Hiro指示日時']?.date?.start ?? null,
    parentIds: (page.properties['上位']?.relation ?? []).map((r) => r.id),
    completed: Boolean(page.properties['完了']?.checkbox || DONE_STATUSES.includes(status)),
  };
}

export async function listTasks(env: NotionEnv, showCompleted: boolean): Promise<TaskListResult> {
  const { token, dataSourceId } = notionConfig(env);
  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  let truncated = false;
  try {
    for (let index = 0; index < 10; index += 1) {
      const body: Record<string, unknown> = {
        page_size: 100,
        ...(!showCompleted ? { filter: { and: [
          { property: '完了', checkbox: { equals: false } },
          ...DONE_STATUSES.map((name) => ({ property: 'ステータス', select: { does_not_equal: name } })),
          { property: 'アーカイブ', checkbox: { equals: false } },
        ] } } : {}),
      };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST', headers: headers(token), body: JSON.stringify(body),
      });
      if (!response.ok) throw new NotionError('notion_query_failed', 502);
      const data = await response.json() as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };
      pages.push(...(data.results ?? []));
      if (!data.has_more) { cursor = null; break; }
      if (!data.next_cursor) throw new NotionError('notion_cursor_missing', 502);
      cursor = data.next_cursor;
    }
    truncated = Boolean(cursor);
  } catch (error) {
    if (error instanceof NotionError) throw error;
    throw new NotionError('notion_unreachable', 502);
  }
  const tasks = pages.map(toTask).filter((task) => showCompleted || !task.completed);
  return { generatedAt: new Date().toISOString(), source: 'Notion', truncated, showCompleted, tasks };
}

export async function completeTask(env: NotionEnv, pageId: string, via: string): Promise<{ ok: true; taskId: string; auditLogged: boolean; completedAt: string }> {
  const { token, dataSourceId } = notionConfig(env);
  if (!/^[a-f0-9-]{32,36}$/i.test(pageId)) throw new NotionError('invalid_completion_request', 400);
  const h = headers(token);
  const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: h });
  if (!pageResponse.ok) throw new NotionError('task_not_found_or_inaccessible', 404);
  const page = await pageResponse.json() as { parent?: { database_id?: string; data_source_id?: string } };
  const source = page.parent?.data_source_id?.replace(/-/g, '').toLowerCase();
  const database = page.parent?.database_id?.replace(/-/g, '').toLowerCase();
  if (source !== dataSourceId.replace(/-/g, '').toLowerCase() && database !== ALLOWED_DATABASE) throw new NotionError('wrong_task_database', 403);
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ properties: { '完了': { checkbox: true }, 'ステータス': { select: { name: '✅ 完了' } }, '実行状況': { select: { name: '完了' } } } }),
  });
  if (!response.ok) throw new NotionError('notion_save_failed', 502);
  const completedAt = new Date().toISOString();
  let auditLogged = false;
  try {
    const audit = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{
        type: 'text', text: { content: `タスクコントロールセンターで完了チェック | ${completedAt} | ${via} | Notion完了反映` },
      }] } }] }),
    });
    auditLogged = audit.ok;
  } catch { /* status saved; audit append failed */ }
  return { ok: true, taskId: pageId, auditLogged, completedAt };
}

/** Completed, non-archived tasks edited within the last `days` days ("今週終わったこと"). */
export async function listRecentDone(env: NotionEnv, days: number): Promise<PrivateTask[]> {
  const { token, dataSourceId } = notionConfig(env);
  const since = new Date(Date.now() - Math.max(1, Math.min(31, days)) * 86_400_000).toISOString();
  const body = {
    page_size: 100,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    filter: { and: [
      { property: 'アーカイブ', checkbox: { equals: false } },
      { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } },
      { or: [{ property: '完了', checkbox: { equals: true } }, ...DONE_STATUSES.map((name) => ({ property: 'ステータス', select: { equals: name } }))] },
    ] },
  };
  const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
  if (!response.ok) throw new NotionError('notion_query_failed', 502);
  const data = await response.json() as { results?: NotionPage[] };
  return (data.results ?? []).map(toTask);
}

export interface RowEdit { nextAction?: string; due?: string | null; instruction?: string }
export const MAX_EDIT_CHARS = 1500;
const MAX_NOTE_HISTORY = 12000;
/** Notion caps one text object at 2,000 chars; a property may hold up to 100 objects. */
export const rich = (text: string) => {
  const chunks: Array<{ type: 'text'; text: { content: string } }> = [];
  for (let i = 0; i < Math.min(text.length, MAX_NOTE_HISTORY); i += 1900) chunks.push({ type: 'text', text: { content: text.slice(i, i + 1900) } });
  return { rich_text: chunks };
};
export const jstStamp = (d = new Date()) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
const plain = (prop: { rich_text?: Array<{ plain_text?: string }> } | undefined) => (prop?.rich_text ?? []).map((p) => p.plain_text ?? '').join('');

export interface NotionEditPage {
  id: string;
  last_edited_time?: string;
  parent?: { database_id?: string; data_source_id?: string };
  properties?: Record<string, {
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name: string } | null;
    date?: { start: string } | null;
  }>;
}
export type RowEditValidator = (page: NotionEditPage, requestHeaders: Record<string, string>) => Promise<void>;

/**
 * Shared edit for any allowed Notion row: next action, due date, and Hiro→AI instruction.
 * The page's parent must match `allowed` (data source id or database id). Appends one audit paragraph.
 */
export async function editRow(env: NotionEnv, pageId: string, edit: RowEdit, allowed: { dataSourceId: string; databaseId: string },
  fields: { nextAction: string; due: string }, via: string, expect: { nextAction?: string; stage?: string; due?: string | null; lastEditedTime?: string } = {}, validate?: RowEditValidator): Promise<{ ok: true; id: string; savedAt: string; auditLogged: boolean }> {
  const { token } = notionConfig(env);
  if (!/^[a-f0-9-]{32,36}$/i.test(pageId)) throw new NotionError('invalid_edit_request', 400);
  const h = headers(token);
  const pageResponse = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { headers: h });
  if (!pageResponse.ok) throw new NotionError('row_not_found_or_inaccessible', 404);
  const page = await pageResponse.json() as NotionEditPage;
  const norm = (v?: string) => (v ?? '').replace(/-/g, '').toLowerCase();
  if (norm(page.parent?.data_source_id) !== norm(allowed.dataSourceId) && norm(page.parent?.database_id) !== norm(allowed.databaseId)) throw new NotionError('wrong_database', 403);
  // optimistic concurrency: refuse when the row changed since the screen was loaded
  if (typeof expect.nextAction === 'string' && plain(page.properties?.[fields.nextAction]).trim() !== expect.nextAction.trim()) throw new NotionError('row_changed_reload', 409);
  if (typeof expect.stage === 'string' && (page.properties?.['パイプライン段階']?.select?.name ?? '') !== expect.stage) throw new NotionError('row_changed_reload', 409);
  if (Object.prototype.hasOwnProperty.call(expect, 'due') && (page.properties?.[fields.due]?.date?.start ?? null) !== expect.due) throw new NotionError('row_changed_reload', 409);
  if (typeof expect.lastEditedTime === 'string' && page.last_edited_time !== expect.lastEditedTime) throw new NotionError('row_changed_reload', 409);
  // The caller may enforce a domain-specific fail-closed check on this freshly re-read page.
  if (validate) await validate(page, h);
  const properties: Record<string, unknown> = {};
  const overflow: string[] = [];
  const now = new Date();
  const notes: string[] = [];
  for (const v of [edit.nextAction, edit.instruction]) if (typeof v === 'string' && v.length > MAX_EDIT_CHARS + 60) throw new NotionError('text_too_long', 400); // callers validate user text at MAX_EDIT_CHARS; +60 leaves room for system markers
  if (typeof edit.nextAction === 'string') { properties[fields.nextAction] = rich(edit.nextAction.trim()); notes.push(`次の一手→${edit.nextAction.trim() || '（空）'}`); }
  if (edit.due !== undefined) {
    if (edit.due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(edit.due)) throw new NotionError('invalid_due', 400);
    properties[fields.due] = { date: edit.due ? { start: edit.due } : null };
    notes.push(`期限→${edit.due ?? '（なし）'}`);
  }
  if (typeof edit.instruction === 'string' && edit.instruction.trim()) {
    const previous = plain(page.properties?.['Hiro→AI指示']);
    const line = `[${jstStamp(now)}] ${edit.instruction.trim()}`;
    // newest first; history beyond the cap is moved (not deleted) into the page body
    const combined = previous ? `${line}\n${previous}` : line;
    properties['Hiro→AI指示'] = rich(combined.slice(0, MAX_NOTE_HISTORY));
    if (combined.length > MAX_NOTE_HISTORY) overflow.push(combined.slice(MAX_NOTE_HISTORY));
    properties['Hiro指示日時'] = { date: { start: now.toISOString() } };
    notes.push(`AIへの指示：${edit.instruction.trim()}`);
  }
  if (!notes.length) throw new NotionError('nothing_to_save', 400);
  const paragraph = (text: string) => ({ object: 'block', type: 'paragraph', paragraph: rich(text) });
  if (overflow.length) {
    // back up the oldest history into the page body FIRST; if that fails, save nothing
    const backup = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers: h, body: JSON.stringify({ children: overflow.map((o) => paragraph(`📦 Hiro→AI指示の古い履歴（列の上限を超えた分をここへ移動）\n${o}`)) }) }).catch(() => null);
    if (!backup?.ok) throw new NotionError('history_backup_failed', 502);
  }
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: h, body: JSON.stringify({ properties }) });
  if (!response.ok) throw new NotionError('notion_save_failed', 502);
  let auditLogged = false;
  try {
    const children = [paragraph(`🗣 Hiro（タスクコントロールセンター）${jstStamp(now)}｜${notes.join('｜')}`)];
    const audit = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, { method: 'PATCH', headers: h, body: JSON.stringify({ children }) });
    auditLogged = audit.ok;
  } catch { /* saved; audit failed */ }
  return { ok: true, id: pageId, savedAt: now.toISOString(), auditLogged };
}
export const TASK_DATABASE = { dataSourceId: '0f570283-d51e-4797-912a-57b54d72e381', databaseId: ALLOWED_DATABASE };
