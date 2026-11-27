/**
 * Owner-only Notion master tasks.
 *   GET   /api/private-tasks[?showCompleted=true][&recentDone=7]   -> task list (+ recently completed)
 *   PATCH /api/private-tasks  {id, completed:true}                   -> mark complete + audit line on the page
 *   PATCH /api/private-tasks  {id, nextAction?, due?, instruction?}  -> edit 次の一手 / 期日 / Hiro→AI指示
 * Auth: owner bearer token (TCC_ACCESS_TOKEN) or a verified Cloudflare Access JWT. Fails closed.
 */
import { authorize, jsonResponse, recordOwnerSeen, type AuthEnv } from '../_lib/auth';
import { ALLOWED_DATABASE, completeTask, editRow, listRecentDone, listTasks, notionConfig, NotionError, type NotionEnv } from '../_lib/notion';
import { notify } from '../_lib/notify';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace }

const authFailure = (status: number, error: string) =>
  jsonResponse({ error: status === 503 ? 'private_tasks_auth_not_configured' : error }, status);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return authFailure(auth.status, auth.error);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  await recordOwnerSeen(env.TCC_STATE, request, auth.via);
  try {
    const params = new URL(request.url).searchParams;
    const showCompleted = params.get('showCompleted') === 'true';
    const recentDays = Number(params.get('recentDone') ?? 0);
    const result = await listTasks(env, showCompleted);
    if (recentDays > 0) {
      const recentDone = await listRecentDone(env, recentDays).catch(() => null);
      return jsonResponse({ ...result, recentDone, recentDoneDays: recentDays });
    }
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
    return jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return authFailure(auth.status, auth.error);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const origin = request.headers.get('Origin');
  if (auth.via === 'access' && (!origin || origin !== new URL(request.url).origin)) return jsonResponse({ error: 'same_origin_required' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return jsonResponse({ error: 'invalid_content_type' }, 415);
  let body: { id?: unknown; completed?: unknown; nextAction?: unknown; due?: unknown; instruction?: unknown; expectNextAction?: unknown; expectDue?: unknown };
  try { body = await request.json() as typeof body; } catch { return jsonResponse({ error: 'invalid_body' }, 400); }
  if ([body.nextAction, body.instruction].some((v) => typeof v === 'string' && v.length > 1500)) return jsonResponse({ error: 'text_too_long' }, 400);
  if (typeof body.id !== 'string') return jsonResponse({ error: 'invalid_completion_request' }, 400);
  if (body.completed !== true) {
    const edit = {
      ...(typeof body.nextAction === 'string' ? { nextAction: body.nextAction } : {}),
      ...(typeof body.due === 'string' || body.due === null ? { due: body.due as string | null } : {}),
      ...(typeof body.instruction === 'string' ? { instruction: body.instruction } : {}),
    };
    try {
      const result = await editRow(env, body.id, edit, { dataSourceId: notionConfig(env).dataSourceId, databaseId: ALLOWED_DATABASE },
        { nextAction: '次の一手', due: '期日' }, auth.via === 'access' ? 'cloudflare-access' : 'owner-token',
        { ...(typeof body.expectNextAction === 'string' ? { nextAction: body.expectNextAction } : {}), ...(typeof body.expectDue === 'string' || body.expectDue === null ? { due: body.expectDue as string | null } : {}) });
      const notified = await notify(env, `Notionタスクを更新しました${edit.instruction ? '（AIへの指示あり）' : ''} (${body.id.slice(0, 8)}…)`, 'tasks');
      return jsonResponse({ ...result, notified });
    } catch (error) {
      if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
      return jsonResponse({ error: 'notion_unreachable' }, 502);
    }
  }
  try {
    const result = await completeTask(env, body.id, auth.via === 'access' ? 'cloudflare-access' : 'owner-token');
    const notified = await notify(env, `Notionタスクを完了にしました (${body.id.slice(0, 8)}…)`, 'tasks', 'success');
    return jsonResponse({ ...result, notified });
  } catch (error) {
    if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
    return jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};
