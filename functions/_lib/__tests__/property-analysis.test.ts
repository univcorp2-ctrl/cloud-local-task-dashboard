import {describe,it,expect,vi} from 'vitest';
import {latestAnalysis,ANALYSIS_SQL} from '../property-analysis';
import {renderSavedAnalysis} from '../unified-property-render';
describe('shared analysis',()=>{
 const row={analysis_id:'a',source_row_hash:'h',current_row_hash:'h',assumptions_json:'{}',evidence_json:'[]',scenarios_json:'{"exit":[]}',verification_status:'provisional'};
 function fake(results:unknown[],success=true){const all=vi.fn(async()=>({success,results}));const bind=vi.fn(()=>({all}));const prepare=vi.fn(()=>({bind}));return {db:{prepare} as unknown as D1Database,prepare,bind}}
 it('exact bounded indexed read',async()=>{const f=fake([row]);const r=await latestAnalysis(f.db,'ad:123');expect(f.prepare).toHaveBeenCalledWith(ANALYSIS_SQL);expect(f.bind).toHaveBeenCalledWith('ad:123');expect(r?.stale).toBe(false);expect(r?.scenarios).toEqual({exit:[]});expect(r?.source_row_hash).toBe('h');});
 it('missing and stale are distinct',async()=>{expect(await latestAnalysis(fake([]).db,'id')).toBeNull();expect((await latestAnalysis(fake([{...row,current_row_hash:'new'}]).db,'id'))?.stale).toBe(true)});
 it('rejects invalid identities and query failure',async()=>{const f=fake([]);await expect(latestAnalysis(f.db,'')).rejects.toThrow('invalid_identity');expect(f.prepare).not.toHaveBeenCalled();await expect(latestAnalysis(fake([],false).db,'id')).rejects.toThrow('query_failed')});
 it('escapes untrusted display and preserves provisional status',()=>{const h=renderSavedAnalysis({analysis_id:'a',verification_status:'<script>',stale:true,scenarios:{acquisition_cost_included:false,exit:[{exit_yield_pct:12,implied_value_man:666,discount:[{renovation_man:200,discount_pct:-2}]}]}});expect(h).not.toContain('<script>');expect(h).toContain('&lt;script&gt;');expect(h).toContain('200 / -2');expect(h).toContain('再確認必要');expect(renderSavedAnalysis(null)).toBe('')});
});
