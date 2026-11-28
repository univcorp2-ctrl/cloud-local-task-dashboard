// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {searchParams} from '../unified-properties';
import {renderUnified,renderPropertyCards} from '../unified-property-render';
const row=(id:number)=>({id:String(id),source:'muse',canonical_id:'ad:'+id,name:'House '+id,price_man:id});
const settle=async(fn:()=>void)=>{await vi.waitFor(fn,{timeout:3000,interval:10})};
function init(total:number, rows:ReturnType<typeof row>[], favs:ReturnType<typeof row>[], failPage=false){
 const f=searchParams('https://example.test/?mode=inventory');
 const html=renderUnified(f,{total,rows,limit:25},[]);
 const parsed=new DOMParser().parseFromString(html,'text/html');
 document.body.innerHTML=parsed.body.innerHTML;localStorage.clear();
 let observer:()=>void=()=>{};
 vi.stubGlobal('IntersectionObserver',class {constructor(cb:(entries:{isIntersecting:boolean}[])=>void){observer=()=>cb([{isIntersecting:true}])}observe(){}});
 const mock=vi.fn(async (input:string,opts?:RequestInit)=>{
   const u=new URL(input,'https://example.test');
   if(u.pathname==='/api/property-favorites')return new Response(JSON.stringify({rows:favs.map(r=>({favorite_key:r.canonical_id,source_id:r.id,source:'property',label:r.name,selected:1,revision:1}))}));
   const detail=u.searchParams.get('detailId'),page=Number(u.searchParams.get('page'));
   if(detail)return new Response(renderPropertyCards(f,[row(Number(detail))]));
   if(failPage&&page===2)return new Response('',{status:503});
   const first=(page-1)*25+1;return new Response(renderPropertyCards({...f,page},Array.from({length:Math.max(0,Math.min(25,total-first+1))},(_,i)=>row(first+i))));
 });
 vi.stubGlobal('fetch',mock);
 const script=parsed.querySelector('script')!.textContent!;
 new Function(script)();
 return {trigger:()=>observer(),mock};
}
afterEach(()=>{vi.unstubAllGlobals();document.body.innerHTML=''});
describe('one-click favorites and continuous scrolling',()=>{
 it('automatically loads all 114 cards without paging buttons',async()=>{
  const {trigger,mock}=init(114,Array.from({length:25},(_,i)=>row(i+1)),[]);
  expect(document.body.textContent).not.toContain('次へ');
  trigger();
  await settle(()=>expect(document.querySelectorAll('#property-results section[data-key]')).toHaveLength(114));
  expect(mock.mock.calls.filter(c=>String(c[0]).includes('fragment=1'))).toHaveLength(4);
  expect(document.getElementById('scroll-retry')!.hidden).toBe(true);
 });
 it('one click loads every saved card, even outside current page',async()=>{
  const {mock}=init(100,[row(1)],[row(1),row(55),row(99)]);
  await settle(()=>expect(document.getElementById('fav-count')!.textContent).toBe('3'));
  document.getElementById('fav-only')!.click();
  await settle(()=>expect(document.querySelectorAll('#favorite-results section[data-key]')).toHaveLength(3));
  expect(document.getElementById('property-results')!.hidden).toBe(true);
  expect(document.querySelector('#favorite-results [data-key="ad:99"]')).not.toBeNull();
  expect(mock.mock.calls.filter(c=>String(c[0]).includes('detailId='))).toHaveLength(3);
  document.getElementById('fav-only')!.click();
  expect(document.getElementById('property-results')!.hidden).toBe(false);
 });
 it('does not silently truncate on network error',async()=>{
  const {trigger}=init(50,Array.from({length:25},(_,i)=>row(i+1)),[],true);trigger();
  await settle(()=>expect(document.getElementById('scroll-retry')!.hidden).toBe(false));
  expect(document.querySelectorAll('#property-results section[data-key]')).toHaveLength(25);
 });
});
