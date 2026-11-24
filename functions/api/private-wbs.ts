/** Read-only owner endpoint; never expose task details in public state or assets. */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { listTasks, notionConfig, NotionError, type NotionEnv } from '../_lib/notion';
import { buildWbs, type WbsData } from '../_lib/wbs';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace }
export const CACHE_MS = 180_000;
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  try {
    const { dataSourceId } = notionConfig(env);
    const key = `tcc:private-wbs:v1:${dataSourceId}`;
    if (new URL(request.url).searchParams.get('refresh') !== '1') {
      try {
        const cached = await env.TCC_STATE?.get<WbsData>(key, 'json');
        const age = cached ? Date.now() - Date.parse(cached.generatedAt) : Infinity;
        if (cached?.source === 'Notion' && age >= 0 && age < CACHE_MS) return jsonResponse(cached);
      } catch { /* cache outage must not block a live read */ }
    }
    const result = await listTasks(env, false);
    const data = buildWbs(result.tasks, new Date(), result.truncated);
    try { await env.TCC_STATE?.put(key, JSON.stringify(data), { expirationTtl: CACHE_MS / 1000 }); } catch { /* live result remains usable */ }
    return jsonResponse(data);
  } catch (error) {
    return error instanceof NotionError ? jsonResponse({ error: error.code }, error.status) : jsonResponse({ error: 'notion_unreachable' }, 502);
  }
};
