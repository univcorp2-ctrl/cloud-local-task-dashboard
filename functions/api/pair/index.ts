/**
 * POST /api/pair — 接続済みの端末（オーナー）が、別の端末（iPhone等）をつなぐための
 * 使い捨てペアリングコードを発行する。コードは10分・1回限り。トークン本体は画面にもURLにも出さない。
 */
import { authorize, jsonResponse, type AuthEnv } from '../../_lib/auth';
import { newPairCode, PAIR_PREFIX, PAIR_TTL } from '../../_lib/pair';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace }

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  if (!env.TCC_STATE) return jsonResponse({ error: 'kv_not_configured' }, 503);
  const code = newPairCode();
  await env.TCC_STATE.put(PAIR_PREFIX + code, '1', { expirationTtl: PAIR_TTL });
  const origin = new URL(request.url).origin;
  return jsonResponse({ code, expiresInSec: PAIR_TTL, url: `${origin}/#pair=${code}` });
};
