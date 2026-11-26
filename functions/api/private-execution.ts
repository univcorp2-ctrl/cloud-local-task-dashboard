import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { executionAis, lamp, type ExecutionDatabase } from '../_lib/execution';

interface Env extends AuthEnv { HIRO_DATA?: ExecutionDatabase }
type Run = {run_id:string;ai:string;task:string;started_at:string;finished_at:string;status:string;item_count:number;evidence_url:string};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  if (!env.HIRO_DATA) return jsonResponse({ error: 'execution_storage_not_configured' }, 503);
  const db = env.HIRO_DATA;
  async function rows<T>(sql:string):Promise<T[]> {
    const result=await db!.prepare(sql).all<T>();
    if(!result.success)throw new Error('d1_query_failed');
    return result.results;
  }
  try {
    const [latest,runs,pending,counts,sources] = await Promise.all([
      rows<Run>('SELECT r.* FROM run_log r WHERE r.run_id = (SELECT x.run_id FROM run_log x WHERE x.ai=r.ai ORDER BY x.finished_at DESC,x.run_id DESC LIMIT 1)'),
      rows<Run>('SELECT * FROM run_log ORDER BY finished_at DESC,run_id DESC LIMIT 30'),
      rows("SELECT * FROM reply_inbox WHERE status IN ('pending','hold') ORDER BY received_at,account,message_id LIMIT 200"),
      rows<{total:number}>("SELECT COUNT(*) AS total FROM reply_inbox WHERE status IN ('pending','hold')"),
      rows('SELECT * FROM inbox_sources ORDER BY account'),
    ]);
    const now=Date.now();
    const agents=executionAis.map(ai=>{
      const last=latest.find(r=>r.ai===ai);
      return {ai,lastAt:last?.finished_at??null,status:last?.status??null,lamp:lamp(last?.finished_at??null,last?.status??null,now)};
    });
    const pendingTotal=counts[0]?.total??0;
    return jsonResponse({generatedAt:new Date(now).toISOString(),agents,runs,pending,pendingTotal,pendingTruncated:pendingTotal>pending.length,sources});
  } catch {
    return jsonResponse({error:'execution_storage_unavailable'},503);
  }
};
