import {beforeEach,describe,it,expect,vi} from 'vitest';
const auth=vi.hoisted(()=>vi.fn());
vi.mock('../auth',()=>({authorize:auth,jsonResponse:(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s})}));
import {onRequestGet} from '../../api/private-background';
const invoke=(env={NOTION_API_TOKEN:'private'})=>(onRequestGet as Function)({request:new Request('https://example.com/api/private-background'),env});
describe('background authorization',()=>{
 beforeEach(()=>vi.unstubAllGlobals());
 it('rejects anonymous and agent before fetching Notion',async()=>{
  const f=vi.fn();vi.stubGlobal('fetch',f);auth.mockResolvedValueOnce({ok:false,status:401,error:'unauthorized'}).mockResolvedValueOnce({ok:true,actor:'agent'});
  expect((await invoke()).status).toBe(401);expect((await invoke()).status).toBe(403);expect(f).not.toHaveBeenCalled();
 });
 it('paginates privately without returning credentials',async()=>{
  auth.mockResolvedValue({ok:true,actor:'owner'});const f=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({results:[],has_more:true,next_cursor:'next'})}).mockResolvedValueOnce({ok:true,json:async()=>({results:[],has_more:false})});vi.stubGlobal('fetch',f);
  const r=await invoke();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(f).toHaveBeenCalledTimes(2);expect(await r.text()).not.toContain('private');
 });
 it('fails closed on missing configuration and remote failure',async()=>{
  auth.mockResolvedValue({ok:true,actor:'owner'});expect((await invoke({NOTION_API_TOKEN:''})).status).toBe(503);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));expect((await invoke()).status).toBe(502);
 });
});
