import type { KVLike } from './kv';
export const REPORT_KEY = 'private:kanashin:html:v1';
type Row={target:string;revision:number;payload:string;op_id:string;created_at:string};
type Doc=Record<string,unknown>;
export interface Store { get(target:string):Promise<Row|null>; list():Promise<Row[]>; history(target:string):Promise<Row[]>; op(id:string):Promise<Row|null>; append(target:string,expected:number,payload:string,id:string):Promise<Row|null> }
export function d1Store(db:D1Database):Store {
  const read=async(sql:string,...args:unknown[]) => {const r=await db.prepare(sql).bind(...args).all<Row>();if(!r.success)throw Error('database_error');return r.results??[]};
  return {
    get:async t=>(await read('SELECT * FROM kanashin_mcp_revisions WHERE target=? ORDER BY revision DESC LIMIT 1',t))[0]??null,
    list:()=>read('SELECT r.* FROM kanashin_mcp_revisions r JOIN (SELECT target,MAX(revision) rev FROM kanashin_mcp_revisions GROUP BY target) s ON r.target=s.target AND r.revision=s.rev ORDER BY r.target'),
    history:t=>read('SELECT * FROM kanashin_mcp_revisions WHERE target=? ORDER BY revision DESC LIMIT 20',t),
    op:async id=>(await read('SELECT * FROM kanashin_mcp_revisions WHERE op_id=?',id))[0]??null,
    append:async(t,e,p,id)=>(await read('INSERT INTO kanashin_mcp_revisions(target,revision,payload,op_id) SELECT ?,?, ?,? WHERE COALESCE((SELECT MAX(revision) FROM kanashin_mcp_revisions WHERE target=?),0)=? ON CONFLICT DO NOTHING RETURNING *',t,e+1,p,id,t,e))[0]??null
  };
}
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ');
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const plain=(s:string)=>decode(s.replace(/<[^>]*>/g,'')).trim();
const attr=(s:string,k:string)=>s.match(new RegExp('\\b'+k+'="([^"]*)"'))?.[1]??'';
export function cards(html:string) {
  return [...html.matchAll(/<section\b([^>]*\bdata-key="[^"]+"[^>]*)>([\s\S]*?)<\/section>/g)].map(m=>{
    const body=m[2], kpis=[...body.matchAll(/<span>([^<]+)<\/span>\s*<b>([^<]+)<\/b>/g)].slice(0,4);
    return {id:attr(m[1],'data-key'),name:plain(body.match(/<h2>([\s\S]*?)<\/h2>/)?.[1]??''),tier:attr(m[1],'data-tier'),hazard:attr(m[1],'data-hz'),metrics:Object.fromEntries(kpis.map(x=>[plain(x[1]),plain(x[2])])),lead:plain(body.match(/<p class="lead">([\s\S]*?)<\/p>/)?.[1]??'')};
  });
}
const defaults={fontSize:15,density:'comfortable',theme:'original',details:'original',maxWidth:860};
const idPattern=/^[a-zA-Z0-9_-]{1,64}$/;
const obj=(x:unknown):Doc=>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('object_required');return x as Doc};
const string=(x:unknown,max=500)=>{if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('invalid_text');return x.trim()};
const number=(x:unknown,min:number,max:number)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw Error('invalid_number');return x};
const one=(x:unknown,values:string[])=>{if(typeof x!=='string'||!values.includes(x))throw Error('invalid_enum');return x};
function only(x:Doc,keys:string[]){if(Object.keys(x).some(k=>!keys.includes(k)))throw Error('unknown_field')}
function url(x:unknown){const s=string(x,1000),u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw Error('invalid_source_url');return u.href}
export function uiPatch(p:Doc) {only(p,Object.keys(defaults));const q:Doc={};for(const [k,v] of Object.entries(p)){q[k]=k==='fontSize'?number(v,14,22):k==='maxWidth'?number(v,640,1200):k==='density'?one(v,['compact','comfortable','spacious']):k==='theme'?one(v,['original','highContrast','cool']):one(v,['original','collapsed','expanded'])}return q}
export function propertyPatch(p:Doc){only(p,['name','status','note','sourceUrl','observedAt','priceMan','annualRentMan','builtYear','structure','nextAction']);const q:Doc={};for(const [k,v] of Object.entries(p)){q[k]=k==='status'?one(v,['調査中','資料請求済','資料受領','販売確認済','掲載終了','見送り']):k==='sourceUrl'?url(v):k==='priceMan'||k==='annualRentMan'?number(v,0.01,1000000):k==='builtYear'?number(v,1800,new Date().getUTCFullYear()+3):k==='structure'?one(v,['木造','軽量鉄骨','鉄骨','RC','SRC']):k==='observedAt'?string(v,50):string(v,k==='name'?160:800)}if(q.observedAt&&!Number.isFinite(Date.parse(String(q.observedAt))))throw Error('invalid_observedAt');return q}
const parsed=(r:Row|null):Doc & {revision:number}=>r?{...JSON.parse(r.payload) as Doc,revision:r.revision}: {revision:0};
function financial(d:Doc){
 if(typeof d.priceMan!=='number'||typeof d.annualRentMan!=='number'||typeof d.builtYear!=='number'||typeof d.structure!=='string')return null;
 const p=d.priceMan,r=d.annualRentMan,age=new Date().getUTCFullYear()-d.builtYear;const total=(price:number)=>price+(price*.03+6)*1.1+price*.031+(price<=5000?1:3)+price*(age>=30?.05:age>=15?.03:0);
 const ratio=(n:number,i:number,g:number,price=p)=>r*.6/(total(price)*(1+g*n*.55)*(i/12/(1-Math.pow(1+i/12,-n*12))*12));
 const life=({木造:22,軽量鉄骨:27,鉄骨:34,RC:47,SRC:47} as Record<string,number>)[d.structure]-age;
 const f=(x:number)=>Math.round(x*100)/100;let lo=0,hi=Math.max(p,r*100);for(let n=0;n<70;n++){const mid=(lo+hi)/2;if(ratio(15,.025,.01,mid)>=1)lo=mid;else hi=mid}
 return {yieldPct:f(r/p*100),costMan:f(total(p)),remainingLife:life,standard15:f(ratio(15,.025,.01)),strict15:f(ratio(15,.03,.018)),standard30:f(ratio(30,.025,.01)),strict30:f(ratio(30,.03,.018)),remainingStandard:life>=10?f(ratio(life,.025,.01)):null,remainingStrict:life>=10?f(ratio(life,.03,.018)):null,maxPrice15:f(lo),discountMan:f(Math.max(0,p-lo)),status:'暫定再計算・原証照合と正本反映前'};
}
const schema=(properties:Doc,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
const st={type:'string'},int={type:'integer',minimum:0},patch={type:'object'};
const writeSchema=(extra:Doc,req:string[])=>schema({...extra,expectedRevision:int,operationId:st},[...req,'expectedRevision','operationId']);
export const KTOOLS=[
 {name:'kanashin_list',description:'List compact report cards (max 50, query filter); use id for detail. Baseline snapshot plus review overlays, not a canonical property master.',inputSchema:schema({query:st,offset:int,limit:int})},
 {name:'kanashin_get',description:'Get one candidate, current revision, and provisional updates/recalculation.',inputSchema:schema({id:st},['id'])},
 {name:'kanashin_get_ui',description:'Read current UI parameters and revision.',inputSchema:schema({})},
 {name:'kanashin_update_ui',description:'Patch UI only: fontSize 14–22, density compact/comfortable/spacious, theme original/highContrast/cool, details original/collapsed/expanded, maxWidth 640–1200. No raw HTML/CSS/JS.',inputSchema:writeSchema({patch},['patch'])},
 {name:'kanashin_update_property',description:'Update existing candidate review overlay (status,note,sourceUrl,observedAt,nextAction,priceMan,annualRentMan,builtYear,structure). Financial changes require HTTPS source and observation timestamp, never overwrite baseline/rank. Recomputed provisional values are displayed.',inputSchema:writeSchema({id:st,patch},['id','patch'])},
 {name:'kanashin_add_candidate',description:'Add a distinct provisional candidate with caller-chosen id beginning new-, name, sourceUrl, observedAt, optional financial fields. Review-only, not ranked.',inputSchema:writeSchema({id:st,patch},['id','patch'])},
 {name:'kanashin_history',description:'Read up to 20 previous versions for an id or ui.',inputSchema:schema({id:st},['id'])},
 {name:'kanashin_restore',description:'Restore a previous version as a new revision; revision 0 clears overlay, never deletes original or history.',inputSchema:writeSchema({id:st,restoreRevision:int},['id','restoreRevision'])}
];
export async function kcall(kv:KVLike,store:Store,name:string,a:Doc){
 const html=await kv.get(REPORT_KEY);if(!html)throw Error('report_unavailable');
 const base=cards(html),rows=await store.list(),over=new Map(rows.map(r=>[r.target,parsed(r)]));
 const exists=(id:string)=>base.some(c=>c.id===id)||Boolean(over.get(id)?.name);
 const get=(id:string)=>{const c=base.find(c=>c.id===id),d=over.get(id)??{revision:0};return {id,base:c??null,overlay:d,calculation:financial(d)}};
 const id=typeof a.id==='string'&&idPattern.test(a.id)?a.id:'';
 if(name==='kanashin_list'){const q=typeof a.query==='string'?a.query.slice(0,100).toLowerCase():'';const offset=number(a.offset??0,0,100000),limit=number(a.limit??20,1,50);const items=[...base.map(c=>({id:c.id,name:c.name,tier:c.tier,hazard:c.hazard,status:over.get(c.id)?.status??null,revision:over.get(c.id)?.revision??0})),...rows.filter(r=>r.target.startsWith('new-')&&!base.some(c=>c.id===r.target)&&over.get(r.target)?.name).map(r=>({id:r.target,name:over.get(r.target)?.name,tier:'HOLD',hazard:'調査中',status:over.get(r.target)?.status??null,revision:r.revision}))].filter(x=>(String(x.name)+' '+x.id).toLowerCase().includes(q));return {total:items.length,offset,items:items.slice(offset,offset+limit)}}
 if(name==='kanashin_get_ui')return {...defaults,...parsed(await store.get('ui'))};
 if(name==='kanashin_get'){if(!exists(id))throw Error('unknown_candidate');return get(id)}
 if(name==='kanashin_history'){if(id!=='ui'&&!exists(id)&&!over.has(id))throw Error('unknown_candidate');return {id,history:(await store.history(id)).map(r=>({revision:r.revision,at:r.created_at,payload:JSON.parse(r.payload)}))}}
 const target=name==='kanashin_update_ui'?'ui':id;
 if(!target||target==='ui'&&name!=='kanashin_update_ui'&&name!=='kanashin_restore')throw Error('invalid_id');
 const expected=number(a.expectedRevision,0,1000000);if(!Number.isInteger(expected))throw Error('integer_required');
 const op=string(a.operationId,100);if(!/^[a-zA-Z0-9_-]+$/.test(op))throw Error('invalid_operation_id');
 const previous=await store.op(op);if(previous){if(previous.target!==target)throw Error('operation_id_conflict');return {id:target,revision:previous.revision,replayed:true}}
 const old=await store.get(target),current=parsed(old);if(current.revision!==expected)throw Error('revision_conflict');
 const {revision:_rev,...prior}=current;let next:Doc;
 if(name==='kanashin_restore'){if(!old)throw Error('unknown_target');const n=number(a.restoreRevision,0,expected);const v=n===0?null:(await store.history(target)).find(r=>r.revision===n);if(n!==0&&!v)throw Error('revision_not_found');next=v?JSON.parse(v.payload):{}}
 else if(name==='kanashin_update_ui')next={...prior,...uiPatch(obj(a.patch))};
 else if(name==='kanashin_update_property'||name==='kanashin_add_candidate'){
   if(name==='kanashin_update_property'&&!exists(id))throw Error('unknown_candidate');
   if(name==='kanashin_add_candidate'&&(!id.startsWith('new-')||exists(id)||old))throw Error('new_id_required');
   const p=propertyPatch(obj(a.patch));if(name==='kanashin_update_property'&&'name'in p)throw Error('identity_immutable');
   const evidenceNeeded=name==='kanashin_add_candidate'||Object.keys(p).some(k=>['priceMan','annualRentMan','builtYear','structure','status'].includes(k));
   if(evidenceNeeded&&(!p.sourceUrl||!p.observedAt))throw Error('source_and_observation_required');
   if(name==='kanashin_add_candidate'&&!p.name)throw Error('name_required');
   next={...prior,...p};
 }else throw Error('unknown_tool');
 const saved=await store.append(target,expected,JSON.stringify(next),op);if(!saved)throw Error('revision_conflict_retry_read');
 return {id:target,revision:saved.revision,payload:next,calculation:financial(next)};
}
export function renderReport(html:string,rows:Row[]){
 const ui={...defaults,...JSON.parse(rows.find(r=>r.target==='ui')?.payload??'{}')};const validated=uiPatch(ui);
 const size=Number(validated.fontSize),width=Number(validated.maxWidth),padding=validated.density==='compact'?9:validated.density==='spacious'?20:14;
 const palette=validated.theme==='highContrast'?'--ink:#101010;--sub:#323232;--ac:#064a43;--bg:#fff;--line:#777':validated.theme==='cool'?'--ac:#184f83;--bg:#f0f5fc;--ac2:#e2edf9':'';
 const style='<style id="kanashin-mcp-ui">:root{'+palette+'}body{font-size:'+size+'px}.wrap{max-width:'+width+'px}.card{padding:'+padding+'px}.sm,.lead,.eval,details summary,table{font-size:'+Math.max(13,size-1)+'px}.btn,.chip{min-height:36px;display:inline-flex;align-items:center}.kpatch{border:1px solid #b7c9d8;padding:10px;margin:8px 0;border-radius:6px;overflow-wrap:anywhere}.kpatch p{margin:4px 0}.kpatch a{color:var(--ac)}@media(max-width:480px){.kpis b{font-size:'+Math.max(16,size+1)+'px}.btn,.chip{min-height:40px}}</style>';
 const map=new Map(rows.filter(r=>r.target!=='ui').map(r=>[r.target,JSON.parse(r.payload) as Doc]));
 const box=(d:Doc,rev:number)=>{const calc=financial(d);const fields=Object.entries(d).filter(([k])=>k!=='sourceUrl').map(([k,v])=>'<p>'+esc(({status:'状態',note:'更新メモ',nextAction:'次の一手',observedAt:'確認日時',priceMan:'価格（万円）',annualRentMan:'満室年家賃（万円）',builtYear:'築年',structure:'構造',name:'物件名'} as Record<string,string>)[k]??k)+'：'+esc(v)+'</p>').join('');return '<div class="kpatch"><strong>MCP更新・照合待ち（v'+rev+'）</strong>'+fields+(d.sourceUrl?'<p><a href="'+esc(url(d.sourceUrl))+'" target="_blank" rel="noopener noreferrer">根拠資料</a></p>':'')+(calc?'<p>暫定再計算：表面 '+calc.yieldPct+'%／総事業費 '+calc.costMan+'万円／15年 '+calc.standard15+'・'+calc.strict15+'／30年 '+calc.standard30+'・'+calc.strict30+'／15年価格上限 '+calc.maxPrice15+'万円。30年は条件付き。旧ランキングは未更新。</p>':'')+'</div>'};
 const seen=new Set<string>();html=html.replace(/<section\b([^>]*\bdata-key="[^"]+"[^>]*)>([\s\S]*?)<\/section>/g,(whole,attrs,body)=>{const id=attr(attrs,'data-key');seen.add(id);const d=map.get(id);return d&&Object.keys(d).length?'<section'+attrs+'>'+body+box(d,rows.find(r=>r.target===id)!.revision)+'</section>':whole});
 const fresh=[...map.entries()].filter(([id,d])=>id.startsWith('new-')&&!seen.has(id)&&d.name).map(([id,d])=>'<section class="card"><h2>'+esc(d.name)+'</h2><p>新規候補・未照合・ランキング対象外</p>'+box(d,rows.find(r=>r.target===id)!.revision)+'</section>').join('');
 if(fresh)html=html.replace(/(<div class="wrap"[^>]*>)/,'$1'+fresh);
 if(validated.details==='collapsed')html=html.replace(/<details\b[^>]*>/g,'<details>');
 if(validated.details==='expanded')html=html.replace(/<details\b[^>]*>/g,'<details open>');
 return html.replace('</head>',style+'</head>');
}
