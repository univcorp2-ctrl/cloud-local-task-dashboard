import {describe,it,expect,vi} from 'vitest';
import {publicViewResponse,PUBLIC_ADS,publicView} from '../public-property-view';
import {onRequestGet} from '../../api/private-kanashin';
import {onRequestGet as favoritesGet,onRequestPost as favoritesPost} from '../../api/property-favorites';
describe('anonymous read-only public projection',()=>{
 it('renders only exact public links and safe numeric scores; never arbitrary private row data',async()=>{
 const url=PUBLIC_ADS[1].url;
 const r=publicViewResponse(new Request('https://x/api/public-properties?q=%3Cscript%3E'),[{url,score:88,secret:'PRIVATE-NOTE'}]);expect(await r.text()).not.toContain('<script>');
 const h=await publicViewResponse(new Request('https://x/api/public-properties'),[{url,score:88,score_json:JSON.stringify({scores:{'エリア':[14,22]},angles:{'立地':{score:80,note:'PRIVATE-NOTE'}},note:'PRIVATE-NOTE'}),name:'PRIVATE-NAME',drive_url:'https://drive.google.com/private'},{url:'https://private.example/secret',score:99}]).text();
 expect(h).toContain('88点 / 100');expect(h).toContain('14 / 22');expect(h).not.toContain('PRIVATE-');expect(h).not.toContain('private.example');expect(h).not.toContain('drive.google.com');expect(h).not.toContain('property-favorites');
 });
 it('does not reuse conflicted scores or ambiguous identities',async()=>{
 const h=await publicViewResponse(new Request('https://x/api/public-properties'),[{url:PUBLIC_ADS[0].url,score:99},{url:PUBLIC_ADS[1].url,score:98},{url:PUBLIC_ADS[1].url,score:97}]).text();expect(h).not.toContain('99点');expect(h).not.toContain('98点');expect(h).toContain('種別矛盾');expect(h).toContain('class="wrap"');expect(h).toContain('class="card"');expect(h).toContain('class="score-detail"');expect(h).toContain('class="grid"');expect(h).not.toContain('<details class="score-detail" open');
 });
 it('redirects only anonymous browser page and never accesses private storage',async()=>{
 const get=vi.fn(),prepare=vi.fn();const env={TCC_ACCESS_TOKEN:'test-owner-token-at-least-24-characters',TCC_STATE:{get},HIRO_DATA:{prepare}};
 const run=(path:string,accept='text/html')=>onRequestGet({request:new Request('https://x/api/private-kanashin'+path,{headers:{Accept:accept}}),env} as unknown as Parameters<typeof onRequestGet>[0]);
 const r=await run('?bank=all&genre=戸建');expect(r.status).toBe(302);expect(r.headers.get('Location')).toContain('/api/public-properties?genre=');expect(get).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();
 expect((await run('?fragment=1')).status).toBe(401);expect((await run('?detailId=secret')).status).toBe(401);expect((await run('','application/json')).status).toBe(401);
 for(const f of [favoritesGet,favoritesPost])expect((await f({request:new Request('https://x/api/property-favorites'),env} as never)).status).toBe(401);
 });
 it('queries only reviewed URLs and returns safe view even when db unavailable',async()=>{
 const all=vi.fn(async()=>({success:true,results:[]}));const bind=vi.fn(()=>({all}));const prepare=vi.fn(()=>({bind}));
 const r=await publicView(new Request('https://x/api/public-properties'),{prepare} as unknown as D1Database);
 expect(r.status).toBe(200);expect(bind).toHaveBeenCalledWith(...PUBLIC_ADS.map(x=>x.url));expect(prepare.mock.calls.length).toBe(1);
 expect((await publicView(new Request('https://x/api/public-properties'))).status).toBe(200);
 });
});