/**
 * Owner-only "進行中の物件" from the Notion 🏠 統一物件マスターDB (the property canon).
 * GET returns only active rows with a next action and deadline; duplicate/stopped rows are excluded.
 * PATCH re-reads the canonical row and its body immediately before write; duplicate locks, holds and stale snapshots fail closed.
 */
import { authorize, jsonResponse, recordOwnerSeen, type AuthEnv } from '../_lib/auth';
import { editRow, notionConfig, NotionError, type NotionEnv, type RowEditValidator } from '../_lib/notion';
import { jstStamp } from '../_lib/notion';
import { notify } from '../_lib/notify';
import { isVisibleActiveDeal, propertyDealWriteBlockReason, PROPERTY_ACTIVE_STAGES, PROPERTY_DUPLICATE_MARKER } from '../_lib/property-deal-guard';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace; NOTION_PROPERTY_DATA_SOURCE_ID?: string }
type Prop = { title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>; select?: { name: string } | null;
  date?: { start: string } | null; url?: string | null; number?: number | null; formula?: { number?: number | null; string?: string | null } };
type Page = { id: string; url: string; last_edited_time?: string; properties: Record<string, Prop> };
export const PROPERTY_SOURCE = '6f4841cf-e44c-466c-b330-c0d6daccb974';
export const PROPERTY_DATABASE = '25c2ceb7d2d640f0aceefa790d9ee161';
export const DONE_MARK = '✅完了';
export const ACTIVE_STAGES = PROPERTY_ACTIVE_STAGES;

const text = (p: Page, k: string) => (p.properties[k]?.title ?? p.properties[k]?.rich_text ?? []).map((x) => x.plain_text ?? '').join('');
const opt = (p: Page, k: string) => p.properties[k]?.select?.name ?? '';
const num = (p: Page, k: string) => { const v = p.properties[k]?.number ?? p.properties[k]?.formula?.number; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
const headers = (token: string) => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Notion-Version': '2025-09-03' });

export function toDeal(p: Page) {
  return {
    id: p.id, url: p.url, name: text(p, '物件名'), stage: opt(p, 'パイプライン段階'), status: opt(p, 'ステータス'),
    rank: opt(p, '仕入れランク'), score: num(p, '総合点'), genre: opt(p, 'ジャンル枠'), kind: opt(p, '種別'),
    area: text(p, '住所/エリア'), station: text(p, '最寄り駅（路線・駅名・徒歩分）'),
    priceMan: num(p, '価格（万円）'), yieldPct: num(p, '表面利回り（%）'), offerPriceMan: num(p, '8.5%到達の指値後価格（万円）'),
    sale: opt(p, '販売確認'), owner: opt(p, '担当AI'), nextAction: text(p, '次の一手'),
    due: p.properties['次の一手の期限']?.date?.start ?? null, risk: text(p, '主なリスク'), loan: text(p, '想定融資'),
    drive: p.properties['Driveフォルダ']?.url ?? null, listing: p.properties['情報源URL']?.url ?? null,
    lastMemo: text(p, '最終更新メモ').split('\n')[0] ?? '', hiroNote: text(p, 'Hiro→AI指示'),
    hiroNoteAt: p.properties['Hiro指示日時']?.date?.start ?? null, updatedAt: p.last_edited_time ?? null,
  };
}
export type Deal = ReturnType<typeof toDeal>;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  await recordOwnerSeen(env.TCC_STATE, request, auth.via);
  let token: string;
  try { token = notionConfig(env).token; } catch (e) { return jsonResponse({ error: e instanceof NotionError ? e.code : 'notion_not_configured' }, 503); }
  const source = env.NOTION_PROPERTY_DATA_SOURCE_ID?.trim() || PROPERTY_SOURCE;
  const pages: Page[] = [];
  let cursor: string | null = null;
  try {
    for (let i = 0; i < 5; i += 1) {
      const body: Record<string, unknown> = {
        page_size: 100,
        filter: { or: ACTIVE_STAGES.map((name) => ({ property: 'パイプライン段階', select: { equals: name } })) },
        sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/data_sources/${source}/query`, { method: 'POST', headers: headers(token), body: JSON.stringify(body) });
      if (!response.ok) return jsonResponse({ error: 'notion_http_' + response.status }, response.status === 404 ? 404 : 502);
      const json = await response.json() as { results?: Page[]; has_more?: boolean; next_cursor?: string | null };
      pages.push(...(json.results ?? []));
      if (!json.has_more || !json.next_cursor) { cursor = null; break; }
      cursor = json.next_cursor;
    }
  } catch { return jsonResponse({ error: 'notion_unreachable' }, 502); }
  const deals = pages.map(toDeal).filter((d) => isVisibleActiveDeal(d));
  return jsonResponse({ generatedAt: new Date().toISOString(), truncated: Boolean(cursor), stages: ACTIVE_STAGES, deals });
};

async function readPageBody(pageId: string, requestHeaders: Record<string, string>): Promise<string> {
  const chunks: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const response = await fetch(url.toString(), { headers: requestHeaders });
    if (!response.ok) throw new NotionError('notion_guard_read_failed', 502);
    const json = await response.json() as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
    const content = JSON.stringify(json.results ?? []);
    chunks.push(content);
    if (content.includes(PROPERTY_DUPLICATE_MARKER)) return chunks.join('\n');
    if (!json.has_more) return chunks.join('\n');
    if (!json.next_cursor) throw new NotionError('notion_guard_incomplete', 502);
    cursor = json.next_cursor;
  }
  throw new NotionError('notion_guard_incomplete', 502);
}

const validateDealWrite: RowEditValidator = async (page, requestHeaders) => {
  const props = page.properties ?? {};
  const rich = (name: string) => (props[name]?.rich_text ?? props[name]?.title ?? []).map((v) => v.plain_text ?? '').join('');
  const bodyText = await readPageBody(page.id, requestHeaders);
  const gate = {
    stage: props['パイプライン段階']?.select?.name ?? '',
    status: props['ステータス']?.select?.name ?? '',
    sale: props['販売確認']?.select?.name ?? '',
    nextAction: rich('次の一手'),
    due: props['次の一手の期限']?.date?.start ?? null,
    hiroNote: rich('Hiro→AI指示'),
    bodyText,
  };
  const reason = propertyDealWriteBlockReason(gate);
  if (reason) throw new NotionError(reason, 409);
  // Re-read after the block scan; if any property/body changed since the first GET, refuse the write.
  const latestResponse = await fetch('https://api.notion.com/v1/pages/' + page.id, { headers: requestHeaders });
  if (!latestResponse.ok) throw new NotionError('notion_guard_read_failed', 502);
  const latest = await latestResponse.json() as typeof page;
  const richOf = (p: typeof page, name: string) => (p.properties?.[name]?.rich_text ?? p.properties?.[name]?.title ?? []).map((v) => v.plain_text ?? '').join('');
  const signature = (p: typeof page) => JSON.stringify([
    p.properties?.['パイプライン段階']?.select?.name ?? '',
    p.properties?.['ステータス']?.select?.name ?? '',
    p.properties?.['販売確認']?.select?.name ?? '',
    richOf(p, '次の一手'),
    p.properties?.['次の一手の期限']?.date?.start ?? null,
    richOf(p, 'Hiro→AI指示'),
  ]);
  if ((page.last_edited_time && latest.last_edited_time !== page.last_edited_time)
    || signature(latest) !== signature(page)) throw new NotionError('row_changed_reload', 409);
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const origin = request.headers.get('Origin');
  if (auth.via === 'access' && (!origin || origin !== new URL(request.url).origin)) return jsonResponse({ error: 'same_origin_required' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return jsonResponse({ error: 'invalid_content_type' }, 415);
  let body: { id?: unknown; nextAction?: unknown; due?: unknown; instruction?: unknown; nextDone?: unknown; previousNext?: unknown;
    expectNextAction?: unknown; expectStage?: unknown; expectDue?: unknown; expectUpdatedAt?: unknown };
  try { body = await request.json() as typeof body; } catch { return jsonResponse({ error: 'invalid_body' }, 400); }
  if ([body.nextAction, body.instruction].some((v) => typeof v === 'string' && v.length > 1500)) return jsonResponse({ error: 'text_too_long' }, 400);
  if (typeof body.id !== 'string') return jsonResponse({ error: 'invalid_edit_request' }, 400);
  if (body.nextDone !== true && body.due === null) return jsonResponse({ error: 'deal_due_required' }, 400);
  if (body.nextDone !== true && typeof body.nextAction === 'string' && !body.nextAction.trim()) return jsonResponse({ error: 'deal_next_action_required' }, 400);
  const previous = typeof body.previousNext === 'string' ? body.previousNext : '';
  if (body.nextDone === true && (!previous.trim() || previous.startsWith(DONE_MARK))) return jsonResponse({ error: 'nothing_to_complete' }, 400);
  if (previous.length > 1500) return jsonResponse({ error: 'text_too_long' }, 400);
  const doneNote = body.nextDone === true ? `✅ 次の一手「${previous.slice(0, 200)}${previous.length > 200 ? '…' : ''}」は完了。次の一手と期限を決めて更新してください。` : '';
  const instruction = [doneNote, typeof body.instruction === 'string' ? body.instruction : ''].filter(Boolean).join(' ');
  const edit = body.nextDone === true
    ? { nextAction: `${DONE_MARK}(${jstStamp()})：${previous}`, due: null, instruction }
    : {
      ...(typeof body.nextAction === 'string' ? { nextAction: body.nextAction } : {}),
      ...(typeof body.due === 'string' || body.due === null ? { due: body.due as string | null } : {}),
      ...(instruction ? { instruction } : {}),
    };
  const expect: { nextAction?: string; stage?: string; due?: string | null; lastEditedTime?: string } = {};
  if (body.nextDone === true) expect.nextAction = previous;
  else if (typeof body.expectNextAction === 'string') expect.nextAction = body.expectNextAction;
  if (typeof body.expectStage === 'string') expect.stage = body.expectStage;
  if (typeof body.expectDue === 'string' || body.expectDue === null) expect.due = body.expectDue as string | null;
  if (typeof body.expectUpdatedAt === 'string') expect.lastEditedTime = body.expectUpdatedAt;
  try {
    const result = await editRow(env, body.id, edit, { dataSourceId: env.NOTION_PROPERTY_DATA_SOURCE_ID?.trim() || PROPERTY_SOURCE, databaseId: PROPERTY_DATABASE },
      { nextAction: '次の一手', due: '次の一手の期限' }, auth.via === 'access' ? 'cloudflare-access' : 'owner-token', expect, validateDealWrite);
    const notified = await notify(env, `物件の進捗を更新しました${instruction ? '（AIへの指示あり）' : ''} (${body.id.slice(0, 8)}…)`, 'deals');
    return jsonResponse({ ...result, notified, nextAction: edit.nextAction ?? null });
  } catch (error) {
    if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
    return jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};
