/**
 * Same-origin read-only proxy for the owner's other public dashboards (the page CSP is
 * connect-src 'self'). Responses are cached in KV for 5 minutes. Only public-safe
 * endpoints are listed; nothing here forwards credentials.
 */
import { jsonResponse } from '../../_lib/auth';

interface Env { TCC_STATE?: KVNamespace }
const SOURCES: Record<string, Record<string, string>> = {
  estateboard: {
    experiments: 'https://estateboard.pages.dev/api/muse/experiment-portfolio',
    social: 'https://estateboard.pages.dev/api/analytics/public-summary',
    journal: 'https://estateboard.pages.dev/api/muse/public-journal',
    daiwa: 'https://estateboard.pages.dev/api/daiwa/summary',
  },
  'revenue-agent': { status: 'https://revenue-agent-ops.pages.dev/status.json' },
};
const TTL_SECONDS = 300;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TaskControlCenter/2.0' }, signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const onRequestGet: PagesFunction<Env, 'source'> = async ({ params, env }) => {
  const source = params.source;
  const endpoints = SOURCES[source];
  if (!endpoints) return jsonResponse({ ok: false, error: 'unknown_source' }, 404);
  const cacheKey = `tcc:external:${source}`;
  if (env.TCC_STATE) {
    const cached = await env.TCC_STATE.get(cacheKey);
    if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-TCC-Cache': 'hit' } });
  }
  const entries = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
    try { return [key, { ok: true, data: await fetchJson(url) }] as const; }
    catch (error) { return [key, { ok: false, error: error instanceof Error ? error.message.slice(0, 80) : 'fetch failed' }] as const; }
  }));
  const body = JSON.stringify({ ok: true, source, fetchedAt: new Date().toISOString(), parts: Object.fromEntries(entries) });
  if (env.TCC_STATE && entries.some(([, v]) => v.ok)) await env.TCC_STATE.put(cacheKey, body, { expirationTtl: TTL_SECONDS });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-TCC-Cache': 'miss' } });
};
