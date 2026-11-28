import {describe,it,expect} from 'vitest';
import {shortlistCte,shortlistQuery} from '../property-shortlist';
import {renderShortlist} from '../property-shortlist-render';
import {parseFilters} from '../property-filters';
const f=parseFilters('https://example.com?bank=all&area=群馬県');
describe('regional candidate lanes',()=>{
 it('binds area and preserves bank conditions and per-lane limits',()=>{const q=shortlistCte(f);expect(q.args).toEqual(['群馬県']);expect(q.cte).toContain('region_rank<=10');expect(q.cte).toContain('duplicate_rank=1');expect(q.cte).toContain('見送り');expect(q.cte).toContain('買付済');expect(q.cte).toContain('重複統合済');expect(q.cte).toContain('gross_yield>=20');expect(q.cte).toContain('転売/保有再検証');expect(q.cte).not.toContain('gross_yield>=8.5');expect(q.cte).toContain('再建築不可');expect(shortlistCte(parseFilters('https://example.com?bank=shizuoka&area=栃木県')).args).toEqual(['栃木県','静岡銀行'])});
 it('does not promote preliminary candidates or county comps to confirmed',()=>{const html=renderShortlist(f,{total:1,counts:{群馬県:1},rows:[{pref:'群馬県',lane:'戸建て',name:'<script>bad</script>',price_man:100,gross_yield:20,region_rank:1,sale:null}],comp:{群馬県:{house:8}}});expect(html).toContain('HOLD・正式推奨前');expect(html).toContain('県別成約標本 8件');expect(html).toContain('個別類似性未確認');expect(html).not.toContain('<script>bad</script>');expect(html).toContain('全登録行を見る')});
 it('reports zero candidates explicitly',()=>{expect(renderShortlist(f,{total:0,counts:{},rows:[],comp:{}})).toContain('条件に合う精査候補はありません')});
});