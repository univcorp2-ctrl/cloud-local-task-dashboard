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
  properties: Record<string, {
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name: string } | null;
    checkbox?: boolean;
    number?: number | null;
    date?: { start: string } | null;
  }>;
}
export interface PrivateTask {
  id: string; url: string; title: string; category: string; priority: string; status: string;
  owner: string; executor: string; assignedAi: string; autonomy: string; due: string | null;
  nextAction: string; humanAction: string; whyHuman: string; executionStatus: string;
  cashDistance: string; order: number | null; completed: boolean;
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
