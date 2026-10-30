/**
 * GET /api/state — live control-center state.
 * Anonymous callers receive quotas + agent heartbeats only; a valid owner/agent token
 * (Authorization: Bearer …) unlocks KPIs, metrics and the event feed.
 */
import { authorize, bearerOf, jsonResponse, type AuthEnv } from '../../_lib/auth';
import { loadState, snapshot } from '../../_lib/state';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TCC_STATE) return jsonResponse({ ok: false, error: 'state_store_not_bound' }, 503);
  let full = false;
  if (bearerOf(request) || request.headers.get('Cf-Access-Jwt-Assertion')) {
    const auth = await authorize(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
    full = true;
  }
  const state = await loadState(env.TCC_STATE);
  return jsonResponse(snapshot(state, Date.now(), full), 200, { 'Cache-Control': 'no-store', Vary: 'Authorization' });
};
