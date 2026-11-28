import { authorize, jsonResponse, safeEqual, type AuthEnv } from '../_lib/auth';
import { d1Store, kcall, KTOOLS } from '../_lib/kanashin';
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
 if(req.method==='initialize')return rpc(id,{protocolVersion:params.protocolVersion==='2025-03-26'?'2025-03-26':'2025-06-18',capabilities:{tools:{listChanged:false}},serverInfo:{name:'kanashin-property-editor',version:'1.0.0'},instructions:'Use list/get and expectedRevision. Write only evidence-backed review overlays; canonical ranking remains unchanged until source reconciliation. UI is bounded parameters. Do not send to banks.'});
 if(req.method.startsWith('notifications/'))return new Response(null,{status:202});
 if(req.method==='ping')return rpc(id,{});
 if(req.method==='tools/list')return rpc(id,{tools:KTOOLS});
 if(req.method==='resources/list')return rpc(id,{resources:[]});
 if(req.method==='prompts/list')return rpc(id,{prompts:[]});
 if(req.method!=='tools/call')return error(id,-32601,'method_not_found');
 if(typeof params.name!=='string'||!KTOOLS.some(t=>t.name===params.name))return error(id,-32602,'unknown_tool');
 try{
  const args=params.arguments??{};if(!args||typeof args!=='object'||Array.isArray(args))throw Error('invalid_arguments');
  const result=await kcall(env.TCC_STATE,d1Store(env.HIRO_DATA),params.name,args as Record<string,unknown>);
  return rpc(id,{content:[{type:'text',text:JSON.stringify(result)}]});
 }catch(e){const msg=e instanceof Error&&/^[a-z0-9_]+$/.test(e.message)?e.message:'operation_failed';return rpc(id,{content:[{type:'text',text:JSON.stringify({error:msg})}],isError:true})}
};
