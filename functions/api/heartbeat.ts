/**
 * GET /api/heartbeat — zero-token watchdog over the scheduled-job lists in the control state.
 *   anonymous            → counts + alert flag only (job names stay private)
 *   Authorization bearer → also the problem list
 *   ?notify=1            → when the problem set changed (or 12h passed), send one Telegram message
 *                          through the existing Worker proxy if TELEGRAM_PROXY_SECRET is bound.
 * Called every 15 minutes by the GitHub Actions cron (.github/workflows/ci.yml).
 */
import { authorize, bearerOf, jsonResponse, type AuthEnv } from '../_lib/auth';
import { loadState } from '../_lib/state';
import { evaluateHeartbeat, heartbeatMessage } from '../_lib/heartbeat';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace; TELEGRAM_PROXY_SECRET?: string; TELEGRAM_PROXY_URL?: string }
const NOTIFIED_KEY = 'tcc:heartbeat:notified';
const LAST_KEY = 'tcc:heartbeat:last';
const RENOTIFY_MS = 12 * 3_600_000;
const DEFAULT_PROXY = 'https://x-realestate-autopost.univcorp2.workers.dev/tg';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TCC_STATE) return jsonResponse({ ok: false, error: 'state_store_not_bound' }, 503);
  let full = false;
  if (bearerOf(request) || request.headers.get('Cf-Access-Jwt-Assertion')) {
    const auth = await authorize(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
    full = true;
  }
  const now = Date.now();
  const result = evaluateHeartbeat(await loadState(env.TCC_STATE), now);
  let changed = false;
  let notified: 'telegram' | 'telegram_failed' | 'no_channel' | 'not_needed' | 'skipped' = 'skipped';
  if (new URL(request.url).searchParams.get('notify') === '1') {
    let prev: { signature: string; at: number } | null = null;
    try { const raw = await env.TCC_STATE.get(NOTIFIED_KEY); prev = raw ? JSON.parse(raw) as { signature: string; at: number } : null; } catch { prev = null; }
    changed = (prev?.signature ?? '') !== result.signature;
    const due = result.alert && (changed || now - (prev?.at ?? 0) > RENOTIFY_MS);
    if (!due) notified = 'not_needed';
    else if (!env.TELEGRAM_PROXY_SECRET) notified = 'no_channel';
    else {
      try {
        const res = await fetch(env.TELEGRAM_PROXY_URL || DEFAULT_PROXY, {
          method: 'POST', headers: { Authorization: `Bearer ${env.TELEGRAM_PROXY_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: heartbeatMessage(result) }),
        });
        notified = res.ok ? 'telegram' : 'telegram_failed';
      } catch { notified = 'telegram_failed'; }
    }
    // Remember the state we reported (also when it recovered) so the same set is not announced every 15 minutes.
    if (changed || notified === 'telegram') await env.TCC_STATE.put(NOTIFIED_KEY, JSON.stringify({ signature: result.signature, at: now }));
    await env.TCC_STATE.put(LAST_KEY, JSON.stringify({ checkedAt: result.checkedAt, counts: result.counts, alert: result.alert }));
  }
  const body = { ok: true, checkedAt: result.checkedAt, alert: result.alert, counts: result.counts, changed, notified,
    ...(full ? { staleSources: result.staleSources, problems: result.problems } : {}) };
  return jsonResponse(body, 200, { 'Cache-Control': 'no-store', Vary: 'Authorization, Cookie' });
};
