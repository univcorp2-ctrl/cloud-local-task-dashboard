/**
 * GET /api/earn — 「稼ぐ・投資」ページ用。Notion 稼ぐパイプライン盤を読み、稼げやすい順に返す。
 * 見られるのは (1) オーナー（トークン／Cookie／Cloudflare Access）か、
 * (2) オーナーが発行した共有キー（X-TCC-Share ヘッダー。読み取り専用・このAPIだけ）。
 * KVに5分キャッシュ。公開の静的ファイルには出さない。
 */
import { authorize, jsonResponse, safeEqual, type AuthEnv } from '../_lib/auth';
import { buildEarn, type NPage } from '../_lib/earn';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace; NOTION_API_TOKEN?: string; NOTION_PIPELINE_DATA_SOURCE_ID?: string }
const DEFAULT_SOURCE = '8809b4a7-383a-4ae7-90ce-722a9a6d6a0e';
export const SHARE_KEY = 'tcc:share:earn:v1';
const CACHE_KEY = 'tcc:earn:v1';
const TTL = 300;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let via: 'owner' | 'share' | null = null;
  const share = (request.headers.get('X-TCC-Share') || '').trim();
  if (share.length >= 24 && env.TCC_STATE) {
    const stored = await env.TCC_STATE.get(SHARE_KEY);
    if (stored && safeEqual(share, stored)) via = 'share';
  }
  if (!via) {
    const auth = await authorize(request, env);
    if (!auth.ok) return jsonResponse({ error: share ? 'invalid_share_key' : auth.error }, share ? 403 : auth.status);
    if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
    via = 'owner';
  }
  const token = env.NOTION_API_TOKEN?.trim();
  if (!token) return jsonResponse({ error: 'notion_not_configured' }, 503);
  const source = (env.NOTION_PIPELINE_DATA_SOURCE_ID || DEFAULT_SOURCE).trim();
  const refresh = via === 'owner' && new URL(request.url).searchParams.get('refresh') === '1';
  let body = !refresh && env.TCC_STATE ? await env.TCC_STATE.get(CACHE_KEY) : null;
  if (!body) {
    const pages: NPage[] = [];
    let cursor: string | null = null;
    try {
      for (let i = 0; i < 3; i += 1) {
        const payload: Record<string, unknown> = { page_size: 100 };
        if (cursor) payload.start_cursor = cursor;
        const response = await fetch(`https://api.notion.com/v1/data_sources/${source}/query`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!response.ok) return jsonResponse({ error: 'notion_query_failed', status: response.status }, 502);
        const data = await response.json() as { results?: NPage[]; has_more?: boolean; next_cursor?: string | null };
        pages.push(...(data.results ?? []));
        if (!data.has_more || !data.next_cursor) break;
        cursor = data.next_cursor;
      }
    } catch { return jsonResponse({ error: 'notion_unreachable' }, 502); }
    body = JSON.stringify(buildEarn(pages));
    if (env.TCC_STATE) await env.TCC_STATE.put(CACHE_KEY, body, { expirationTtl: TTL });
  }
  // via はキャッシュに入れず、応答ごとに付ける
  return new Response(body.replace(/^\{/, `{"via":"${via}",`), { headers: HEADERS });
};
