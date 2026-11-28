/** Owner-only report; source snapshot stays in private KV. */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { d1Store, renderReport, REPORT_KEY } from '../_lib/kanashin';
import { searchParams,liveSearch,sourceStats } from '../_lib/unified-properties';
import { archiveRows,renderUnified } from '../_lib/unified-property-render';
interface Env extends AuthEnv { TCC_STATE?: KVNamespace; HIRO_DATA?: D1Database }
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
 const auth = await authorize(request, env);
 if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
 if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
 const filters=searchParams(request.url);
 if(!env.HIRO_DATA)return jsonResponse({error:'master_unavailable'},503);
 let html:string;
 try{
   const cachedStats=async()=>{const key='private:property-source-stats:v1';try{const cached=await env.TCC_STATE?.get(key);if(cached){const d=JSON.parse(cached);if(Date.now()-d.at<60000&&Array.isArray(d.rows))return d.rows;}}catch{/* optional aggregate cache */}
     const rows=await sourceStats(env.HIRO_DATA!);try{await env.TCC_STATE?.put(key,JSON.stringify({at:Date.now(),rows}),{expirationTtl:120})}catch{/* cache is not required */}return rows};
   const [stats,revisions]=await Promise.all([cachedStats(),d1Store(env.HIRO_DATA).list()]);
   const ui=JSON.parse(revisions.find(r=>r.target==='ui')?.payload??'{}');
   if(filters.mode==='archive'){
     const base=await env.TCC_STATE?.get(REPORT_KEY);
     if(!base)return jsonResponse({error:'private_report_unavailable'},503);
     html=renderUnified(filters,{total:0,rows:[],limit:25},stats,archiveRows(renderReport(base,revisions),filters),ui);
   }else html=renderUnified(filters,await liveSearch(env.HIRO_DATA,filters),stats,undefined,ui);
 }catch{return jsonResponse({error:'master_query_failed'},503)}
 return new Response(html,{headers:{
 'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive',
 'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
 }});
};