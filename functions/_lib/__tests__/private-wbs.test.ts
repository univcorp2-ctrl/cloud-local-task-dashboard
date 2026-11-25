import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestGet, CACHE_MS } from '../../api/private-wbs';
import { buildWbs } from '../wbs';

const owner = 'o'.repeat(32), agent = 'a'.repeat(32);
const env = () => ({ TCC_ACCESS_TOKEN: owner, TCC_AGENT_TOKEN: agent, NOTION_API_TOKEN:'fixture', NOTION_DATA_SOURCE_ID:'a'.repeat(32), TCC_STATE: { get:vi.fn().mockResolvedValue(null),put:vi.fn().mockResolvedValue(undefined) } });
const call = (e: ReturnType<typeof env>, token = owner, query = '') => onRequestGet({env:e,request:new Request('https://example.test/api/private-wbs'+query,{headers:token?{Authorization:'Bearer '+token}:{}})} as never);
afterEach(()=>vi.unstubAllGlobals());
describe('owner-only WBS API',()=>{
  it('rejects anonymous and agents before reading the private cache',async()=>{
    const e=env();
    expect((await call(e,'')).status).toBe(401);
    expect((await call(e,agent)).status).toBe(403);
    expect(e.TCC_STATE.get).not.toHaveBeenCalled();
  });
  it('uses only fresh cache and makes refresh bypass it',async()=>{
    const e=env(); e.TCC_STATE.get.mockResolvedValue(buildWbs([]));
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({results:[],has_more:false})});vi.stubGlobal('fetch',fetcher);
    expect((await call(e)).headers.get('Cache-Control')).toContain('no-store');
    expect(fetcher).not.toHaveBeenCalled();
    await call(e,owner,'?refresh=1');expect(fetcher).toHaveBeenCalledOnce();
    e.TCC_STATE.get.mockResolvedValue(buildWbs([],new Date(Date.now()-CACHE_MS-1)));
    await call(e);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('fails closed when Notion is unconfigured even if a cache exists',async()=>{
    const e=env();e.NOTION_API_TOKEN='';e.TCC_STATE.get.mockResolvedValue(buildWbs([]));
    expect((await call(e)).status).toBe(503);expect(e.TCC_STATE.get).not.toHaveBeenCalled();
  });
  it('does not serve stale private results after upstream failure',async()=>{
    const e=env();e.TCC_STATE.get.mockResolvedValue(buildWbs([],new Date(0)));vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    const response=await call(e);expect(response.status).toBe(502);expect(await response.text()).not.toContain('pillars');
  });
});
