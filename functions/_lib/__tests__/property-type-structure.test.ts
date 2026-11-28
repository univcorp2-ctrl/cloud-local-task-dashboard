import {describe,it,expect} from 'vitest';
import {searchParams,liveSql,matchesStructure,matchesGenre} from '../unified-properties';
import {renderUnified,archiveRows} from '../unified-property-render';
describe('property type and construction selectors',()=>{
 it('combines type and structure in ranked and inventory queries, binding both copies',()=>{
  const f=searchParams('https://x/?mode=inventory&genre=戸建&structure=木造');
  const q=liveSql(f);expect(q.args).toEqual(['戸建','木造','木質','W造','戸建','木造','木質','W造']);
  expect(q.rows).toContain("一括");expect(q.rows).toContain("COALESCE(structure");
  expect(liveSql({...f,mode:'ranked'}).args).toEqual(['戸建','木造','木質','W造']);
 });
 it('does not confuse RC with SRC or steel with light steel',()=>{
  expect(matchesStructure('RC','SRC造')).toBe(false);expect(matchesStructure('RC','鉄筋コンクリート造')).toBe(true);
  expect(matchesStructure('鉄骨','軽量鉄骨造')).toBe(false);expect(matchesStructure('軽量鉄骨','軽量鉄骨造')).toBe(true);
  expect(matchesGenre('戸建','戸建て','一棟アパート・戸建一括')).toBe(false);
 });
 it('renders selectors and explicit score and rank, with unscored separate',()=>{
  const f=searchParams('https://x/?mode=ranked&genre=戸建&structure=木造');
  const s=renderUnified(f,{total:2,limit:25,rows:[{id:'1',source:'ranking',score:74,rank:'A',name:'A'},{id:'2',source:'notion',name:'B'}]},[]);
  expect(s).toContain('<select name="genre">');expect(s).toContain('<select name="structure">');
  expect(s).toContain('value="戸建" selected');expect(s).toContain('value="木造" selected');
  expect(s).toContain('74点');expect(s).toContain('既存ランク A');expect(s).toContain('未採点');
 });
 it('filters archive by explicit name and lead while retaining original cards',()=>{
  const f=searchParams('https://x/?mode=archive&genre=戸建&structure=木造');
  const a=archiveRows('<section data-key="p1"><h2>戸建 A</h2><p class="lead">木造</p></section><section data-key="p2"><h2>土地 B</h2></section>',f);
  expect(a.total).toBe(1);expect(a.body).toContain('p1');expect(a.body).not.toContain('p2');
 });
});
