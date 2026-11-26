/**
 * Owner-only "進行中の物件" from the Notion 🏠 統一物件マスターDB (the property canon).
 *   GET   /api/private-deals                                   -> active deals (買付済 / 買付準備 / 銀行打診 / 資料受領 / 資料請求済 / 深掘り済)
 *   PATCH /api/private-deals  {id, nextAction?, due?, instruction?, nextDone?:true}
 *         nextDone=true records "次の一手 完了" as a Hiro→AI instruction so the AI sets the following step.
 * The Notion token stays server side. Fails closed like /api/private-tasks.
 */
import { authorize, jsonResponse, recordOwnerSeen, type AuthEnv } from '../_lib/auth';
import { editRow, notionConfig, NotionError, type NotionEnv } from '../_lib/notion';
import { jstStamp } from '../_lib/notion';
import { notify } from '../_lib/notify';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace; NOTION_PROPERTY_DATA_SOURCE_ID?: string }
type Prop = { title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>; select?: { name: string } | null;
  date?: { start: string } | null; url?: string | null; number?: number | null; formula?: { number?: number | null; string?: string | null } };
type Page = { id: string; url: string; last_edited_time?: string; properties: Record<string, Prop> };

export const PROPERTY_SOURCE = '6f4841cf-e44c-466c-b330-c0d6daccb974';
export const PROPERTY_DATABASE = '25c2ceb7d2d640f0aceefa790d9ee161';
/** Order matters: later = closer to buying. */
export const DONE_MARK = '✅完了';
export const ACTIVE_STAGES = ['深掘り済', '資料請求済', '資料受領', '銀行打診', '買付準備', '買付済'] as const;

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
  const deals = pages.map(toDeal).filter((d) => d.status !== '見送り' && d.sale !== '掲載終了');
  return jsonResponse({ generatedAt: new Date().toISOString(), truncated: Boolean(cursor), stages: ACTIVE_STAGES, deals });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const origin = request.headers.get('Origin');
  if (auth.via === 'access' && (!origin || origin !== new URL(request.url).origin)) return jsonResponse({ error: 'same_origin_required' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return jsonResponse({ error: 'invalid_content_type' }, 415);
  let body: { id?: unknown; nextAction?: unknown; due?: unknown; instruction?: unknown; nextDone?: unknown; previousNext?: unknown };
  try { body = await request.json() as typeof body; } catch { return jsonResponse({ error: 'invalid_body' }, 400); }
  if ([body.nextAction, body.instruction].some((v) => typeof v === 'string' && v.length > 1500)) return jsonResponse({ error: 'text_too_long' }, 400);
  if (typeof body.id !== 'string') return jsonResponse({ error: 'invalid_edit_request' }, 400);
  const previous = typeof body.previousNext === 'string' ? body.previousNext : '';
  if (body.nextDone === true && (!previous.trim() || previous.startsWith(DONE_MARK))) return jsonResponse({ error: 'nothing_to_complete' }, 400);
  if (previous.length > 1500) return jsonResponse({ error: 'text_too_long' }, 400);
  const doneNote = body.nextDone === true ? `✅ 次の一手「${previous.slice(0, 200)}${previous.length > 200 ? '…' : ''}」は完了。次の一手と期限を決めて更新してください。` : '';
  const instruction = [doneNote, typeof body.instruction === 'string' ? body.instruction : ''].filter(Boolean).join(' ');
  // nextDone persists in Notion: 次の一手 becomes "✅完了(日時)：…" and the deadline is cleared, so the box cannot be re-sent.
  const edit = body.nextDone === true
    ? { nextAction: `${DONE_MARK}(${jstStamp()})：${previous}`, due: null, instruction }
    : {
      ...(typeof body.nextAction === 'string' ? { nextAction: body.nextAction } : {}),
      ...(typeof body.due === 'string' || body.due === null ? { due: body.due as string | null } : {}),
      ...(instruction ? { instruction } : {}),
    };
  try {
    const result = await editRow(env, body.id, edit, { dataSourceId: env.NOTION_PROPERTY_DATA_SOURCE_ID?.trim() || PROPERTY_SOURCE, databaseId: PROPERTY_DATABASE },
      { nextAction: '次の一手', due: '次の一手の期限' }, auth.via === 'access' ? 'cloudflare-access' : 'owner-token',
      body.nextDone === true ? { nextAction: previous } : {});
    const notified = await notify(env, `物件の進捗を更新しました${instruction ? '（AIへの指示あり）' : ''} (${body.id.slice(0, 8)}…)`, 'deals');
    return jsonResponse({ ...result, notified, nextAction: edit.nextAction ?? null });
  } catch (error) {
    if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
    return jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};
