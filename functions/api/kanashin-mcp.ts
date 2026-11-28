import { authorize, jsonResponse, safeEqual, type AuthEnv } from '../_lib/auth';
import { d1Store, kcall, KTOOLS } from '../_lib/kanashin';
import {searchParams,liveSearch,liveGet,sourceStats,identityGet,identityStats} from '../_lib/unified-properties';
import {observe} from '../_lib/property-observation';
import {latestAnalysis} from '../_lib/property-analysis';
const UTOOLS=[
{name:'property_analysis_get',description:'Read the latest saved analysis by exact canonicalId, including rent, market yields, land value, exit scenarios, evidence and stale flag. Null means no saved analysis. Never treat estimates as verified sales.',inputSchema:{type:'object',properties:{canonicalId:{type:'string'}},required:['canonicalId'],additionalProperties:false}},
{name:'property_identity_get',description:'Read source rows for an exact canonical ID. Evidence conflicts remain separate; no fuzzy merge.',inputSchema:{type:'object',properties:{canonicalId:{type:'string'}},required:['canonicalId'],additionalProperties:false}},
{name:'property_identity_status',description:'Current identity coverage and unresolved counts. Exact ad keys are not verified physical parcels.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
{name:'property_observe',description:'Save a new evidence-backed AI observation into shared D1 properties; atomically journal operation and verify readback. Not a decision, recommendation, bank approval or overwrite of Notion/source rows. Stable recordKey provider:listingID; use same across AIs. First expectedRowHash empty, later exact row_hash. Source URL and offset-aware observation timestamp required. Numeric units: 万円, %, m2, years. Never use invented values.',inputSchema:{type:'object',properties:{operationId:{type:'string'},recordKey:{type:'string'},agent:{type:'string'},sourceUrl:{type:'string'},observedAt:{type:'string'},expectedRowHash:{type:'string'},patch:{type:'object',description:'name,address,pref,city,town,station,line,walk_min,genre,price_man,gross_yield,rent_year_man,structure,built_year,land_m2,building_m2,units,road_width_m,road_type,frontage_m,rebuild_ok,hazard,listed_date,status. Required name,address,price_man on create. Omit unknowns.'},evidenceNote:{type:'string'}},required:['operationId','recordKey','agent','sourceUrl','observedAt','expectedRowHash','patch'],additionalProperties:false}},
{name:'property_search',description:'Search shared D1 dashboard. ranked=current scored generation; new=recent ingests; inventory=all sources; review=Notion candidates. Page returns compact 25 rows max; no AI inference.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['ranked','new','inventory','review']},bank:{type:'string'},area:{type:'string'},source:{type:'string'},genre:{type:'string'},q:{type:'string'},sort:{type:'string'},page:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:25}},additionalProperties:false}},{name:'property_get',description:'Read exact source property ID or ranking ID. Do not fuzzy-merge or overwrite master.',inputSchema:{type:'object',properties:{id:{type:'string'},source:{type:'string'}},required:['id','source'],additionalProperties:false}},{name:'property_sources',description:'D1 per-source row counts, new today and last seen.',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
interface Env extends AuthEnv { TCC_STATE?: KVNamespace; HIRO_DATA?: D1Database; KANASHIN_MCP_TOKEN?: string }
async function allowed(request:Request,env:Env){
 const bearer=request.headers.get('Authorization')??'';
 const scoped=env.KANASHIN_MCP_TOKEN?.trim()??'';
 if(scoped.length>=32&&bearer.startsWith('Bearer ')&&safeEqual(bearer.slice(7),scoped))return true;
 const auth=await authorize(request,env);return auth.ok&&auth.actor==='owner';
}
const rpc=(id:unknown,result:unknown)=>jsonResponse({jsonrpc:'2.0',id,result});
const error=(id:unknown,code:number,message:string,status=200)=>jsonResponse({jsonrpc:'2.0',id,error:{code,message}},status);
export const onRequestGet:PagesFunction<Env>=async({request,env})=>!(await allowed(request,env))?error(null,-32001,'authentication_required',401):new Response(null,{status:405,headers:{Allow:'POST'}});
export const onRequestPost:PagesFunction<Env>=async({request,env})=>{
 const origin=request.headers.get('Origin');
 if(origin&&origin!==new URL(request.url).origin)return error(null,-32001,'origin_not_allowed',403);
 if(!(await allowed(request,env)))return error(null,-32001,'authentication_required',401);
 if(!env.TCC_STATE||!env.HIRO_DATA)return error(null,-32000,'storage_unavailable',503);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return error(null,-32600,'json_required',415);
 const raw=await request.text();if(raw.length>16000)return error(null,-32600,'request_too_large',413);
 let req:Record<string,unknown>;try{req=JSON.parse(raw)}catch{return error(null,-32700,'parse_error',400)}
 if(!req||typeof req!=='object'||Array.isArray(req)||req.jsonrpc!=='2.0'||typeof req.method!=='string')return error(null,-32600,'invalid_request',400);
 const id=req.id??null;const params=(req.params??{}) as Record<string,unknown>;
 if(req.method==='initialize')return rpc(id,{protocolVersion:params.protocolVersion==='2025-03-26'?'2025-03-26':'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'kanashin-property-editor',version:'1.3.0'},instructions:'Use property_search/get, canonical_id and property_identity_get. property_observe saves evidence-backed source observations into shared D1; Notion decisions and canonical ranking remain protected. Use expectedRowHash and operationId; UI is bounded. Do not send to banks.'});
 if(req.method.startsWith('notifications/'))return new Response(null,{status:202});
 if(req.method==='ping')return rpc(id,{});
 const owner=async()=>{const auth=await authorize(request,env);return auth.ok&&auth.actor==='owner'};
 if(req.method==='tools/list'){const isOwner=await owner();return rpc(id,{tools:[...KTOOLS,...UTOOLS.filter(t=>t.name!=='property_analysis_get'||isOwner)]})}
 if(req.method==='resources/list')return rpc(id,{resources:[]});
 if(req.method==='prompts/list')return rpc(id,{prompts:[]});
 if(req.method!=='tools/call')return error(id,-32601,'method_not_found');
 if(typeof params.name!=='string'||![...KTOOLS,...UTOOLS].some(t=>t.name===params.name))return error(id,-32602,'unknown_tool');
 try{
  const args=params.arguments??{};if(!args||typeof args!=='object'||Array.isArray(args))throw Error('invalid_arguments');
  const a=args as Record<string,unknown>;
  let result:unknown;
  if(params.name==='property_analysis_get'){if(!(await owner()))return error(id,-32001,'owner_scope_required',403);result=await latestAnalysis(env.HIRO_DATA,a.canonicalId)}
  else if(params.name==='property_observe')result=await observe(env.HIRO_DATA,a);
  else if(params.name==='property_identity_get')result=await identityGet(env.HIRO_DATA,String(a.canonicalId??''));
  else if(params.name==='property_identity_status')result=await identityStats(env.HIRO_DATA);
  else if(params.name==='property_sources')result=await sourceStats(env.HIRO_DATA);
  else if(params.name==='property_get')result=await liveGet(env.HIRO_DATA,String(a.id??''),String(a.source??''));
  else if(params.name==='property_search'){
    const u=new URL('https://local.invalid/');for(const k of ['mode','bank','area','source','genre','q','sort','page'])if(a[k]!=null)u.searchParams.set(k,String(a[k]));
    const f=searchParams(u.href);if(f.mode==='archive')throw Error('invalid_mode');
    const limit=Math.max(1,Math.min(25,Math.trunc(Number(a.limit??10))||10));
    const d=await liveSearch(env.HIRO_DATA,f,limit);
    result={...d,rows:d.rows.map(({raw_json:_raw,...r})=>r)};
  }else result=await kcall(env.TCC_STATE,d1Store(env.HIRO_DATA),params.name,a);
  return rpc(id,{content:[{type:'text',text:JSON.stringify(result)}]});
 }catch(e){const msg=e instanceof Error&&/^[a-z0-9_]+$/.test(e.message)?e.message:'operation_failed';return rpc(id,{content:[{type:'text',text:JSON.stringify({error:msg})}],isError:true})}
};
