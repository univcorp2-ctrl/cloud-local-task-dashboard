/**
 * GET /api/connect?key=<owner token>[&json=1]
 * Validates the owner token and stores it in an HttpOnly, Secure, SameSite=Lax cookie for 400 days,
 * so the browser stays connected even if localStorage is cleared (Safari ITP, in-app browsers).
 * Then redirects to the overview (or returns JSON when json=1). DELETE clears the cookie.
 */
import { jsonResponse, OWNER_COOKIE, safeEqual, type AuthEnv } from '../_lib/auth';

const cookie = (value: string, maxAge: number) =>
  `${OWNER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = (url.searchParams.get('key') || '').trim();
  const ok = key.length >= 24 && safeEqual(key, env.TCC_ACCESS_TOKEN?.trim() || '');
  if (url.searchParams.get('json') === '1') {
    return ok ? jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie(key, 400 * 86400) }) : jsonResponse({ ok: false, error: 'invalid_token' }, 403);
  }
  if (!ok) return new Response('接続キーが正しくありません。', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(null, { status: 302, headers: { Location: '/#overview', 'Set-Cookie': cookie(key, 400 * 86400), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
};

export const onRequestDelete: PagesFunction<AuthEnv> = async () =>
  jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
