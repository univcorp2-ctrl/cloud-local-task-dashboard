/**
 * Owner-only workflow sources. The Notion token stays server side.
 * Each source is reported separately: missing/denied is NOT an empty inbox.
 */
import { authorize, jsonResponse, recordOwnerSeen, type AuthEnv } from '../_lib/auth';
import { notionConfig, NotionError, type NotionEnv } from '../_lib/notion';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace; NOTION_ACTION_LOG_DATA_SOURCE_ID?: string; NOTION_PIPELINE_DATA_SOURCE_ID?: string }
type Prop = { title?: Array<{plain_text?:string}>; rich_text?: Array<{plain_text?:string}>; select?: {name:string}|null; date?: {start:string}|null; url?:string|null; number?:number|null };
type Page = {id:string; url:string; last_edited_time?:string; properties:Record<string,Prop>};
const str=(p:Page,k:string)=>(p.properties[k]?.title??p.properties[k]?.rich_text??[]).map(x=>x.plain_text??'').join('');
const opt=(p:Page,k:string)=>p.properties[k]?.select?.name??'';
const url=(p:Page,k:string)=>p.properties[k]?.url??null;
const date=(p:Page,k:string)=>p.properties[k]?.date?.start??null;
const headers=(token:string)=>({Authorization:'Bearer '+token,'Content-Type':'application/json','Notion-Version':'2025-09-03'});
async function rows(token:string, sourceId:string):Promise<{items:Page[];truncated:boolean}>{
  if (!/^[a-f0-9-]{32,36}$/i.test(sourceId)) throw new Error('invalid_source_id');
  const items:Page[]=[];let cursor:string|null=null;
  for(let i=0;i<10;i++){
    const payload:Record<string,unknown>={page_size:100};
    if(cursor)payload.start_cursor=cursor;
    const response=await fetch('https://api.notion.com/v1/data_sources/'+sourceId+'/query',
      {method:'POST',headers:headers(token),body:JSON.stringify(payload)});
    if(!response.ok)throw new Error('notion_http_'+response.status);
    const json=await response.json() as {results?:Page[];has_more?:boolean;next_cursor?:string|null};
    items.push(...(json.results??[]));
    if(!json.has_more)return {items,truncated:false};
    if(!json.next_cursor)throw new Error('missing_cursor');
    cursor=json.next_cursor;
  }
  return {items,truncated:!!cursor};
}
const actionSource='6f2d699d-3351-412f-8906-9c59c9c056a1';
const pipelineSource='8809b4a7-383a-4ae7-90ce-722a9a6d6a0e';
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  const auth=await authorize(request,env);
  if(!auth.ok)return jsonResponse({error:auth.error},auth.status);
  if(auth.actor!=='owner')return jsonResponse({error:'owner_token_required'},403);
  await recordOwnerSeen(env.TCC_STATE,request,auth.via);
  let token:string;
  try{token=notionConfig(env).token}
  catch(e){return jsonResponse({error:e instanceof NotionError?e.code:'notion_not_configured'},503)}
  const actions=await rows(token,env.NOTION_ACTION_LOG_DATA_SOURCE_ID??actionSource).then(d=>({
    ok:true as const,truncated:d.truncated,items:d.items.map(p=>({
      id:p.id,url:p.url,title:str(p,'件名'),propertyId:str(p,'property_id'),action:opt(p,'アクション'),
      result:opt(p,'結果'),channel:opt(p,'経路'),agency:str(p,'元付け'),
      occurredAt:date(p,'実行日時'),evidenceUrl:url(p,'GmailスレッドURL'),
      driveFolder:str(p,'Driveフォルダ'),listingUrl:url(p,'掲載URL'),note:str(p,'メモ')
    }))
  })).catch(e=>({ok:false as const,error:e instanceof Error?e.message:'source_unavailable',items:[]}));
  const pipeline=await rows(token,env.NOTION_PIPELINE_DATA_SOURCE_ID??pipelineSource).then(d=>({
    ok:true as const,truncated:d.truncated,items:d.items.map(p=>({
      id:p.id,url:p.url,title:str(p,'ストリーム'),stage:opt(p,'段階'),
      actor:str(p,'実行AI'),responsible:opt(p,'担当タスク'),lastAction:str(p,'今回やったこと'),
      updatedAt:p.last_edited_time??null,verifiedAt:date(p,'最終実行照合日'),
      nextAction:str(p,'次の一手'),due:date(p,'次の一手の期日'),
      blocker:str(p,'課題'),humanDecision:str(p,'Hiro判断待ち'),
      evidenceUrl:url(p,'証拠URL')??url(p,'実行ログURL'),
      contactCount:p.properties['接触数']?.number??null,
      replyCount:p.properties['返信数']?.number??null
    }))
  })).catch(e=>({ok:false as const,error:e instanceof Error?e.message:'source_unavailable',items:[]}));
  return new Response(JSON.stringify({generatedAt:new Date().toISOString(),actions,pipeline,channels:{
    gmail:{mode:'notion-action-log-only',directSync:false},
    messenger:{mode:'not-connected',directSync:false},
    line:{mode:'not-connected',directSync:false}
  }}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
};
