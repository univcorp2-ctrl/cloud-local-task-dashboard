/**
 * POST /api/pair/redeem {code} — ペアリングコードを1回だけ使い、この端末にオーナー用Cookie（400日）を付ける。
 * 失敗が10分で20回を超えたら一時停止（総当たり対策）。
 */
import { jsonResponse, OWNER_COOKIE, type AuthEnv } from '../../_lib/auth';
import { normalizePairCode, PAIR_FAIL_KEY, PAIR_MAX_FAILS, PAIR_PREFIX } from '../../_lib/pair';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const kv = env.TCC_STATE;
  const owner = env.TCC_ACCESS_TOKEN?.trim();
  if (!kv || !owner) return jsonResponse({ ok: false, error: 'not_configured' }, 503);
  const fails = Number(await kv.get(PAIR_FAIL_KEY) || '0');
  if (fails >= PAIR_MAX_FAILS) return jsonResponse({ ok: false, error: 'too_many_attempts' }, 429);
  let code = '';
  try { code = normalizePairCode(((await request.json()) as { code?: unknown }).code); } catch { /* empty body */ }
  const key = PAIR_PREFIX + code;
  if (code.length !== 8 || !(await kv.get(key))) {
    await kv.put(PAIR_FAIL_KEY, String(fails + 1), { expirationTtl: 600 });
    return jsonResponse({ ok: false, error: 'invalid_or_expired_code' }, 403);
  }
  await kv.delete(key);
  const cookie = `${OWNER_COOKIE}=${encodeURIComponent(owner)}; Path=/; Max-Age=${400 * 86400}; HttpOnly; Secure; SameSite=Lax`;
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': cookie });
};
