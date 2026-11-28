type Doc=Record<string,unknown>;
export const ANALYSIS_SQL="SELECT a.*,p.row_hash AS current_row_hash FROM property_analysis_snapshots a LEFT JOIN properties p ON p.property_id=a.property_id WHERE a.canonical_id=? ORDER BY a.analysis_date DESC,a.created_at DESC,a.analysis_id DESC LIMIT 1";
export async function latestAnalysis(db:D1Database,canonicalId:unknown){
 if(typeof canonicalId!=='string'||!canonicalId.trim()||canonicalId.length>512)throw Error('invalid_identity');
 const r=await db.prepare(ANALYSIS_SQL).bind(canonicalId).all<Doc>();
 if(!r.success)throw Error('query_failed');
 const a=r.results?.[0];if(!a)return null;
 const {assumptions_json,evidence_json,scenarios_json,current_row_hash,...rest}=a;
 return {...rest,stale:current_row_hash!==a.source_row_hash,assumptions:JSON.parse(String(assumptions_json)),evidence:JSON.parse(String(evidence_json)),scenarios:JSON.parse(String(scenarios_json))};
}
