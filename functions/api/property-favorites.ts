import {authorize,jsonResponse,type AuthEnv} from '../_lib/auth';
import {cards,REPORT_KEY} from '../_lib/kanashin';
import {liveGet} from '../_lib/unified-properties';
interface Env extends AuthEnv {HIRO_DATA?:D1Database;TCC_STATE?:KVNamespace}
type Doc=Record<string,unknown>;
async function rows(db:D1Database,sql:string,a:unknown[]=[]){const r=await db.prepare(sql).bind(...a).all<Doc>();if(!r.success)throw Error('query_failed');return r.results??[]}
const select='SELECT favorite_key,source_id,source,label,selected,revision,updated_at FROM property_favorites';
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const a=await authorize(request,env);if(!a.ok)return jsonResponse({error:a.error},a.status);if(a.actor!=='owner')return jsonResponse({error:'owner_required'},403);
 if(!env.HIRO_DATA)return jsonResponse({error:'storage_unavailable'},503);
 try{return jsonResponse({rows:await rows(env.HIRO_DATA,select+' ORDER BY updated_at DESC LIMIT 1000')})}catch{return jsonResponse({error:'read_failed'},503)}
};
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const a=await authorize(request,env);if(!a.ok)return jsonResponse({error:a.error},a.status);if(a.actor!=='owner')return jsonResponse({error:'owner_required'},403);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return jsonResponse({error:'origin_required'},403);
 if(!env.HIRO_DATA||!request.headers.get('Content-Type')?.startsWith('application/json'))return jsonResponse({error:'invalid_request'},400);
 try{
  const raw=await request.text();if(raw.length>2500)return jsonResponse({error:'too_large'},413);
  const b=JSON.parse(raw) as Doc,key=String(b.key??''),id=String(b.id??''),source=String(b.source??'');
  if(!key||key.length>256||!id||id.length>160||!['property','ranking','archive'].includes(source)||typeof b.selected!=='boolean'||!Number.isSafeInteger(b.expectedRevision)||Number(b.expectedRevision)<0)return jsonResponse({error:'invalid_favorite'},400);
  const old=(await rows(env.HIRO_DATA,select+' WHERE favorite_key=?',[key]))[0];
  if(b.legacyImport===true&&old)return jsonResponse({row:old});
  let label:string;
  if(source==='archive'){
   if(key!==id)return jsonResponse({error:'invalid_archive_key'},400);
   const html=await env.TCC_STATE?.get(REPORT_KEY);const card=html?cards(html).find(c=>c.id===id):null;
   if(!card)return jsonResponse({error:'unknown_archive_card'},404);label=card.name;
  }else{
   const r=await liveGet(env.HIRO_DATA,id,source);
   if(!r||r.canonical_id!==key)return jsonResponse({error:'identity_changed_reload'},409);
   label=String(r.name??id);
  }
  const expected=Number(b.expectedRevision),selected=b.selected?1:0;
  if(Number(old?.revision??0)!==expected)return jsonResponse({error:'revision_conflict',row:old??null},409);
  await rows(env.HIRO_DATA,"INSERT INTO property_favorites(favorite_key,source_id,source,label,selected,revision) VALUES(?,?,?,?,?,1) ON CONFLICT(favorite_key) DO UPDATE SET source_id=excluded.source_id,source=excluded.source,label=excluded.label,selected=excluded.selected,revision=property_favorites.revision+1,updated_at=CURRENT_TIMESTAMP WHERE property_favorites.revision=?",[key,id,source,label.slice(0,250),selected,expected]);
  const saved=(await rows(env.HIRO_DATA,select+' WHERE favorite_key=?',[key]))[0];
  if(!saved||saved.selected!==selected||Number(saved.revision)!==expected+1)return jsonResponse({error:'revision_conflict',row:saved??null},409);
  return jsonResponse({row:saved});
 }catch{return jsonResponse({error:'favorite_write_failed'},503)}
};
