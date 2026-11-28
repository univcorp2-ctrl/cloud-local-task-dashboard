/** Owner-only report; source snapshot stays in private KV. */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { d1Store, renderReport, REPORT_KEY } from '../_lib/kanashin';
interface Env extends AuthEnv { TCC_STATE?: KVNamespace; HIRO_DATA?: D1Database }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
 const auth = await authorize(request, env);
 if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
 if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
 const base = await env.TCC_STATE?.get(REPORT_KEY);
 if (!base) return jsonResponse({ error: 'private_report_unavailable' }, 503);
 let html=base;
 try {if(!env.HIRO_DATA)throw Error('D1 missing');html=renderReport(base,await d1Store(env.HIRO_DATA).list());}
 catch {html=base.replace(/(<div class="wrap"[^>]*>)/,'$1<p role="alert">更新情報の取得に失敗しました。原本スナップショットのみ表示しています。</p>')}
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