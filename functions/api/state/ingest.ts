/**
 * POST /api/state/ingest — upsert quotas/kpis/metrics/events/agents in one call.
 * Body: {"quotas":[…],"kpis":[…],"metrics":[…],"events":[…],"agents":[…],"actor":"pc-collector"}
 * Requires a valid owner or agent token. Returns what was applied.
 */
import { authorize, jsonResponse, type AuthEnv } from '../../_lib/auth';
import { applyIngest, loadState, saveState, ValidationError, type IngestPayload } from '../../_lib/state';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TCC_STATE) return jsonResponse({ ok: false, error: 'state_store_not_bound' }, 503);
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return jsonResponse({ ok: false, error: 'json_required' }, 415);
  const raw = await request.text();
  if (raw.length > 60_000) return jsonResponse({ ok: false, error: 'body_too_large' }, 413);
  let payload: IngestPayload & { actor?: unknown };
  try { payload = JSON.parse(raw); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const actor = typeof payload.actor === 'string' && /^[a-z0-9_.-]{2,40}$/i.test(payload.actor) ? payload.actor : auth.actor;
  try {
    const state = await loadState(env.TCC_STATE);
    const summary = applyIngest(state, payload, actor);
    await saveState(env.TCC_STATE, state);
    return jsonResponse({ ok: true, actor, applied: summary, updatedAt: state.updatedAt });
  } catch (error) {
    if (error instanceof ValidationError) return jsonResponse({ ok: false, error: 'validation', message: error.message }, 400);
    return jsonResponse({ ok: false, error: 'ingest_failed' }, 500);
  }
};
