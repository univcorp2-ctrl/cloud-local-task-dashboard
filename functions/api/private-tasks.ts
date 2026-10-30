/**
 * Owner-only Notion master tasks.
 *   GET   /api/private-tasks[?showCompleted=true]   -> task list
 *   PATCH /api/private-tasks  {id, completed:true}  -> mark complete + audit line on the page
 * Auth: owner bearer token (TCC_ACCESS_TOKEN) or a verified Cloudflare Access JWT. Fails closed.
 */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { completeTask, listTasks, NotionError, type NotionEnv } from '../_lib/notion';
import { applyIngest, loadState, saveState } from '../_lib/state';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace }

const authFailure = (status: number, error: string) =>
  jsonResponse({ error: status === 503 ? 'private_tasks_auth_not_configured' : error }, status);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return authFailure(auth.status, auth.error);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  try {
    const showCompleted = new URL(request.url).searchParams.get('showCompleted') === 'true';
    return jsonResponse(await listTasks(env, showCompleted));
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
  let body: { id?: unknown; completed?: unknown };
  try { body = await request.json() as typeof body; } catch { return jsonResponse({ error: 'invalid_body' }, 400); }
  if (typeof body.id !== 'string' || body.completed !== true) return jsonResponse({ error: 'invalid_completion_request' }, 400);
  try {
    const result = await completeTask(env, body.id, auth.via === 'access' ? 'cloudflare-access' : 'owner-token');
    if (env.TCC_STATE) {
      const state = await loadState(env.TCC_STATE);
      applyIngest(state, { events: [{ kind: 'success', message: `Notionタスクを完了にしました (${body.id.slice(0, 8)}…)`, topic: 'tasks' }] }, 'owner');
      await saveState(env.TCC_STATE, state);
    }
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof NotionError) return jsonResponse({ error: error.code }, error.status);
    return jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};
