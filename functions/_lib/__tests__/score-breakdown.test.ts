// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {searchParams} from '../unified-properties';
import {renderUnified,archiveRows} from '../unified-property-render';
describe('score breakdown',()=>{
 it('shows adjusted score before property name and six stored axes collapsed even in expanded mode',()=>{
 const f=searchParams('https://x/?mode=ranked');
 const html=renderUnified(f,{total:1,limit:25,rows:[{id:'1',source:'ranking',name:'物件A',score:75,rank:'A',raw_json:JSON.stringify({scores:{'エリア':[14,22],'融資評価':[16,20],'利回り割安度':[13,16],'土地出口':[13,16],'決算書への影響':[7,15],'融資期間・残債利回り':[6,11]},angles:{'売りやすさ・流動性':{score:71}},score_gates:['資料未受領×0.8']})}]},[],undefined,{details:'expanded'});
 const doc=new DOMParser().parseFromString(html,'text/html'),card=doc.querySelector('section')!,panel=card.querySelector('details.score-detail') as HTMLDetailsElement;
 expect(card.firstElementChild).toBe(panel);expect(panel.open).toBe(false);expect(panel.querySelector('summary')!.textContent).toContain('75点');expect(panel.querySelectorAll('tr')).toHaveLength(12);expect(panel.textContent).toContain('14 / 22');expect(panel.textContent).toContain('71 / 100');expect(panel.textContent).toContain('資料未受領×0.8');
 (panel.querySelector('summary') as HTMLElement).click();expect(panel.open).toBe(true);(panel.querySelector('summary') as HTMLElement).click();expect(panel.open).toBe(false);
 });
 it('never fabricates axes or numeric score for legacy judgment',()=>{
 const f=searchParams('https://x/?mode=archive');
 const a=archiveRows('<section data-key="p1" data-tier="A"><h2>物件B</h2></section>',f);
 expect(a.body).toContain('総合 未採点');expect(a.body).toContain('旧判定 A');expect(a.body).toContain('未確認 / 22');
 });
});
