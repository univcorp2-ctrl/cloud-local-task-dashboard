/**
 * 「稼ぐ・投資」ページを、ログインなしで外から見るための共有リンク（読み取り専用）。
 * POST   /api/share  オーナーだけ。新しいキーを発行（古いキーは無効になる）→ {url}
 * GET    /api/share  オーナーだけ。発行済みかどうかだけ返す（キーは返さない）
 * DELETE /api/share  オーナーだけ。リンクを無効にする
 * キーは URL の # の後ろに付ける（サーバーのログやリファラーに残らない）。
 */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { newPairCode } from '../_lib/pair';
import { SHARE_KEY } from './earn';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace }

async function owner(request: Request, env: Env): Promise<Response | null> {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  if (!env.TCC_STATE) return jsonResponse({ error: 'kv_not_configured' }, 503);
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await owner(request, env);
  if (denied) return denied;
  const key = newPairCode(32);
  await env.TCC_STATE!.put(SHARE_KEY, key);
  return jsonResponse({ ok: true, url: `${new URL(request.url).origin}/#earn=${key}` });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await owner(request, env);
  if (denied) return denied;
  return jsonResponse({ ok: true, exists: Boolean(await env.TCC_STATE!.get(SHARE_KEY)) });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await owner(request, env);
  if (denied) return denied;
  await env.TCC_STATE!.delete(SHARE_KEY);
  return jsonResponse({ ok: true });
};
