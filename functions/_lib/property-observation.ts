import {PREFS} from './property-filters';
type Doc=Record<string,unknown>;
const fields=['name','address','pref','city','town','station','line','walk_min','genre','price_man','gross_yield','rent_year_man','structure','built_year','land_m2','building_m2','units','road_width_m','road_type','frontage_m','rebuild_ok','hazard','listed_date','status','source_url'] as const;
const numbers:Record<string,[number,number,boolean]>={walk_min:[0,300,true],price_man:[0.01,100000000,false],gross_yield:[0,1000,false],rent_year_man:[0,100000000,false],built_year:[1800,new Date().getUTCFullYear()+5,true],land_m2:[0.01,100000000,false],building_m2:[0.01,100000000,false],units:[1,100000,true],road_width_m:[0,1000,false],frontage_m:[0,100000,false]};
const obj=(x:unknown):Doc=>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('object_required');return x as Doc};
const str=(x:unknown,max=300)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('invalid_text');return x.trim()};
const token=(x:unknown,max=150)=>{const s=str(x,max);if(!/^[A-Za-z0-9_.:-]+$/.test(s))throw Error('invalid_key');return s};
const url=(x:unknown)=>{const s=str(x,1000),u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||[...u.searchParams.keys()].some(k=>/token|password|secret|signature|api.?key|auth/i.test(k)))throw Error('invalid_evidence_url');return u.href};
const date=(x:unknown)=>{const s=str(x,50),ms=Date.parse(s);if(!Number.isFinite(ms)||!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(s)||ms>Date.now()+300000)throw Error('invalid_observed_at');return new Date(ms).toISOString()};
const day=(ms:number)=>new Date(ms+9*3600000).toISOString().slice(0,10);
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const canonical=(x:unknown):string=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x as Doc).sort().map(k=>JSON.stringify(k)+':'+canonical((x as Doc)[k])).join(',')+'}';
export function validateObservation(a:Doc){
 const allowed=['operationId','recordKey','agent','sourceUrl','observedAt','expectedRowHash','patch','evidenceNote'];
 if(Object.keys(a).some(k=>!allowed.includes(k)))throw Error('unknown_field');
 const operationId=token(a.operationId,100),recordKey=token(a.recordKey,180),agent=token(a.agent,50);
 const sourceUrl=url(a.sourceUrl),observedAt=date(a.observedAt);
 const expected=a.expectedRowHash;
 if(typeof expected!=='string'||!/^(?:[a-f0-9]{64})?$/.test(expected))throw Error('expected_row_hash_required');
 const patch=obj(a.patch);if(!Object.keys(patch).length||Object.keys(patch).some(k=>!fields.includes(k as typeof fields[number])||k==='source_url'))throw Error('unknown_or_empty_patch');
 const out:Doc={};
 for(const [k,v] of Object.entries(patch)){
  // Unknowns remain null on creation, never erase existing evidence implicitly.
  if(v===null)throw Error('null_patch_not_allowed');
  if(numbers[k]){const [min,max,int]=numbers[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||int&&!Number.isInteger(v))throw Error('invalid_number');out[k]=v}
  else if(k==='pref'){if(!(PREFS as readonly string[]).includes(String(v)))throw Error('invalid_pref');out[k]=v}
  else if(k==='status'){if(!['active','ended','sold','dropped'].includes(String(v)))throw Error('invalid_status');out[k]=v}
  else if(k==='listed_date'){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('invalid_listed_date');out[k]=v}
  else out[k]=str(v,k==='address'?300:200);
 }
 const evidenceNote=a.evidenceNote==null?'':str(a.evidenceNote,600);
 if(['ended','sold','dropped'].includes(String(out.status))&&!evidenceNote)throw Error('status_evidence_required');
 return {operationId,recordKey,agent,sourceUrl,observedAt,expected,patch:out,evidenceNote};
}
async function rows<T=Doc>(db:D1Database,sql:string,args:unknown[]=[]){const r=await db.prepare(sql).bind(...args).all<T>();if(!r.success)throw Error('query_failed');return r.results??[]}
export async function observe(db:D1Database,a:Doc){
 const v=validateObservation(a),recordId='aiobs:'+await sha(v.recordKey);
 const requestHash=await sha(canonical(v));
 const existingOp=async()=> (await rows(db,'SELECT operation_id,record_id,request_hash,result_hash,observed_at FROM property_observation_events WHERE operation_id=?',[v.operationId]))[0];
 const receipt=(r:Doc,replayed:boolean)=>({operationId:r.operation_id,recordId:r.record_id,rowHash:r.result_hash,observedAt:r.observed_at,replayed,state:'OBSERVATION_SAVED_NOT_RECOMMENDED'});
 const prev=await existingOp();if(prev){if(prev.request_hash!==requestHash)throw Error('operation_id_conflict');return receipt(prev,true)}
 const current=(await rows(db,'SELECT * FROM properties WHERE property_id=?',[recordId]))[0];
 if(current&&current.source!=='ai_observation')throw Error('protected_source');
 if((current?.row_hash??'')!==v.expected)throw Error('revision_conflict');
 if(current&&current.source_url!==v.sourceUrl)throw Error('identity_change');
 const next:Doc=Object.fromEntries(fields.map(k=>[k,current?.[k]??null]));
 Object.assign(next,v.patch,{source_url:v.sourceUrl});if(!next.status)next.status='active';
 if(!next.name||!next.address||typeof next.price_man!=='number')throw Error('name_address_price_required');
 const resultHash=await sha(canonical(next));
 const payload=JSON.stringify({fields:next,observation:{recordKey:v.recordKey,agent:v.agent,observedAt:v.observedAt,evidenceUrl:v.sourceUrl,evidenceNote:v.evidenceNote,operationId:v.operationId}});
 try{await rows(db,'INSERT INTO property_observation_events(operation_id,record_id,expected_hash,request_hash,result_hash,payload,observed_at,observed_day,created_day,agent) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING',[v.operationId,recordId,v.expected,requestHash,resultHash,payload,v.observedAt,day(Date.parse(v.observedAt)),day(Date.now()),v.agent])}
 catch(err){const prior=await existingOp();if(prior&&prior.request_hash===requestHash)return receipt(prior,true);const msg=String(err);for(const code of ['revision_conflict','stale_observation','identity_change','protected_source'])if(msg.includes(code))throw Error(code);throw Error('observation_write_failed')}
 const saved=await existingOp();if(!saved||saved.request_hash!==requestHash)throw Error('operation_id_conflict');
 const actual=(await rows(db,'SELECT row_hash,last_seen FROM properties WHERE property_id=?',[recordId]))[0];
 if(!actual||actual.row_hash!==resultHash)throw Error('observation_readback_conflict');
 return {...receipt(saved,false),lastSeen:actual.last_seen};
}
