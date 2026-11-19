import {authorize,jsonResponse,type AuthEnv} from '../_lib/auth';
import {BACKGROUND_SOURCE,toBackground} from '../_lib/background';
interface Env extends AuthEnv {NOTION_API_TOKEN?:string}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
  const auth=await authorize(request,env);
  if(!auth.ok)return jsonResponse({error:auth.error},auth.status);
  if(auth.actor!=='owner')return jsonResponse({error:'owner_token_required'},403);
  if(!env.NOTION_API_TOKEN)return jsonResponse({error:'notion_not_configured'},503);
  const items:ReturnType<typeof toBackground>[]=[];let cursor:string|null=null;
  try{
    for(let i=0;i<20;i++){
      const response=await fetch(`https://api.notion.com/v1/data_sources/${BACKGROUND_SOURCE}/query`,{
        method:'POST',headers:{Authorization:`Bearer ${env.NOTION_API_TOKEN}`,'Content-Type':'application/json','Notion-Version':'2025-09-03'},
        body:JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})})});
      if(!response.ok)throw new Error('notion_query_failed');
      const data=await response.json() as {results:Parameters<typeof toBackground>[0][];has_more:boolean;next_cursor:string|null};
      items.push(...data.results.map(toBackground));
      if(!data.has_more){cursor=null;break;}
      if(!data.next_cursor)throw new Error('notion_cursor_missing');
      cursor=data.next_cursor;
    }
    return new Response(JSON.stringify({generatedAt:new Date().toISOString(),source:'Notion',truncated:!!cursor,items}),
      {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return jsonResponse({error:'background_source_unavailable'},502);}
};
