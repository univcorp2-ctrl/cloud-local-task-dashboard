/** Owner-only private report. The content lives exclusively in the bound KV,
 * never in static assets, git, logs or the public frontend bundle. */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
interface Env extends AuthEnv { TCC_STATE?: KVNamespace }
const KEY = 'private:kanashin:html:v1';
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const html = await env.TCC_STATE?.get(KEY);
  if (!html) return jsonResponse({ error: 'private_report_unavailable' }, 503);
  return new Response(html, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  }});
};
