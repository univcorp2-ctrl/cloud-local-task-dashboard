// @vitest-environment jsdom
import {describe,expect,it,vi} from 'vitest';
import {renderUnified} from '../unified-property-render';
import {searchParams} from '../unified-properties';

describe('property favorite scroll toolbar',()=>{
 it('hides down, reveals up, ignores jitter and bounce, keeps favorite filter usable',async()=>{
  const html=renderUnified(searchParams('https://example.test/api/private-kanashin'),{total:1,rows:[{id:'1',source:'notion',name:'Test'}],limit:25},[]);
  const parsed=new DOMParser().parseFromString(html,'text/html');
  document.body.innerHTML=parsed.body.innerHTML;
  const bar=document.querySelector('.favbar')!;
  const toggle=document.getElementById('fav-only')!;
  const root=document.scrollingElement||document.documentElement;
  Object.defineProperty(root,'scrollHeight',{configurable:true,value:2000});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:500});
  let y=0;
  Object.defineProperty(window,'scrollY',{configurable:true,get:()=>y});
  const fetchStub=vi.fn(async()=>({ok:true,json:async()=>({rows:[]})}));
  new Function('window','document','localStorage','fetch',parsed.querySelector('script')!.textContent!)(window,document,localStorage,fetchStub);
  const move=(n:number)=>{y=n;window.dispatchEvent(new Event('scroll'))};
  const hidden=()=>bar.classList.contains('favbar-hidden');
  expect(hidden()).toBe(false);
  move(5);expect(hidden()).toBe(false);
  move(30);expect(hidden()).toBe(true);
  move(28);expect(hidden()).toBe(true);
  move(20);expect(hidden()).toBe(false);
  move(100);expect(hidden()).toBe(true);
  move(1500);move(1540);move(1500);expect(hidden()).toBe(true);
  move(1491);expect(hidden()).toBe(false);
  move(1500);move(1600);expect(hidden()).toBe(false);
  move(100);move(130);expect(hidden()).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab'}));expect(hidden()).toBe(false);
  toggle.click();expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(document.getElementById('property-results')!.hidden).toBe(true);expect(document.getElementById('favorite-results')!.hidden).toBe(false);
  toggle.click();expect(document.getElementById('property-results')!.hidden).toBe(false);expect(document.getElementById('favorite-results')!.hidden).toBe(true);
  move(200);expect(hidden()).toBe(true);
  move(-10);expect(hidden()).toBe(false);
  await Promise.resolve();await Promise.resolve();
  expect(fetchStub).toHaveBeenCalledWith('/api/property-favorites',expect.objectContaining({credentials:'same-origin'}));
  expect(html).toContain('prefers-reduced-motion:reduce');
 });
});