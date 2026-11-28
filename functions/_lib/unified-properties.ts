import {PREFS,parseFilters,type Filters} from './property-filters';
const bankAliases:Record<string,string[]>={kanashin:['かながわ信金','かながわ信用金庫','神奈川信金','神奈川信用金庫','神奈川の信金'],kanashin_db:['かながわ信金','かながわ信用金庫','神奈川信金','神奈川信用金庫','神奈川の信金'],shizuoka:['静岡銀行'],jfc:['日本政策金融公庫'],resona:['りそな銀行'],yokohama:['横浜銀行'],chiba:['千葉銀行'],shichijushichi:['七十七銀行'],kobe:['神戸信用金庫','神戸信金'],asuka:['あすか信用組合','あすか信組','飛鳥信用組合'],kiraboshi:['きらぼし銀行'],gunma:['群馬銀行'],tochigi:['栃木銀行'],ashikaga:['足利銀行']};
const modes=['ranked','new','inventory','review','archive'] as const;
export type Mode=typeof modes[number];
export type Search=Filters&{mode:Mode;q:string;source:string;genre:string;sort:string};
const sources=['all','notion','muse','terass','terass_house','cgs','estateboard','daiwa'];
export function searchParams(url:string):Search{
 const u=new URL(url),p=u.searchParams;const f=parseFilters(url);
 const mode=p.get('mode') as Mode;const source=p.get('source')??'all';
 return {...f,bank:p.has('bank')?f.bank:'all',mode:modes.includes(mode)?mode:p.get('bank')==='kanashin'?'archive':'ranked',q:(p.get('q')??'').trim().slice(0,80),source:sources.includes(source)?source:'all',genre:(p.get('genre')??'').slice(0,40),sort:p.get('sort')==='score'?'score':p.get('sort')==='new'||mode==='new'||mode==='inventory'?'new':'score'};
}
const path=(k:string)=>"json_extract(CASE WHEN json_valid(raw_json) THEN raw_json ELSE '{}' END,'$.notion.\""+k+"\"')";
const bank=path('融資候補銀行'),score=path('総合点'),stage=path('パイプライン段階'),sale=path('販売確認'),status=path('ステータス');
const deny="'見送り','買付済','成約済','売却済','掲載終了','販売終了','重複統合済','失効','紹介停止','HOLD','本人承認待ち','本人GO待ち','外部回答待ち'";
const bankWhere=(f:Search,expr:string,args:unknown[])=>{const a=bankAliases[f.bank]??[];if(!a.length)return '';args.push(...a);return ' AND ('+a.map(()=>"instr(COALESCE("+expr+",''),?)>0").join(' OR ')+')'};
export function liveSql(f:Search){
 const args:unknown[]=[];
 if(f.mode==='ranked'){
  let w="list='reco'";
  if(f.area==='unknown')w+=" AND (address IS NULL OR trim(address)='')";
  else if(f.area!=='all'){w+=' AND address LIKE ?';args.push(f.area+'%')}
  if(f.q){w+=" AND instr(COALESCE(name,'')||' '||COALESCE(address,''),?)>0";args.push(f.q)}
  if(f.genre){w+=' AND instr(COALESCE(kind,genre),?)>0';args.push(f.genre)}
  const safe="CASE WHEN json_valid(raw_json) THEN raw_json ELSE '{}' END";
  const bankExpr="COALESCE(json_extract("+safe+",'$.fmt.loan2.\"②打診すべき銀行\"'),'')||' '||COALESCE(json_extract("+safe+",'$.loan'),'')";
  w+=bankWhere(f,bankExpr,args);
  if(f.source!=='all'){w+=" AND EXISTS (SELECT 1 FROM json_each("+safe+",'$.sources') WHERE value=?)";args.push(f.source)}
  const cte="WITH r AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY COALESCE(NULLIF(property_id,''),rid) ORDER BY total_score DESC,pos,rid) AS rn FROM v_rank_active WHERE "+w+")";
  return {args,count:cte+' SELECT count(*) n FROM r WHERE rn=1',rows:cte+" SELECT COALESCE(NULLIF(property_id,''),rid) AS id,'ranking' AS source,name,address,station,kind AS genre,price AS price_text,yield AS yield_text,structure,built AS built_text,total_score AS score,rank,ai_status,top_risk,notion_url AS notion_page,drive_url,run_at AS last_seen,raw_json FROM r WHERE rn=1 ORDER BY "+(f.sort==='new'?'run_at DESC,total_score DESC':'total_score DESC,run_at DESC')+",id LIMIT ? OFFSET ?"};
 }
 let w="status='active' AND price_man>0";
 if(f.mode==='new')w+=" AND first_seen>=date('now','+9 hours','-1 day')";
 if(f.mode==='review')w+=" AND source='notion' AND COALESCE("+stage+",'') NOT IN ("+deny+") AND COALESCE("+status+",'') NOT IN ("+deny+") AND COALESCE("+sale+",'') NOT IN ("+deny+") AND COALESCE("+path('次の一手')+",'') NOT LIKE '%重複統合済%' AND COALESCE(rebuild_ok,'') NOT IN ('不可','再建築不可','false','0') AND COALESCE(hazard,'') NOT IN ('赤','レッド','レッドゾーン')";
 if(f.area==='unknown')w+=" AND (pref IS NULL OR trim(pref)='')";
 else if(f.area!=='all'){w+=' AND pref=?';args.push(f.area)}
 if(f.source!=='all'){w+=' AND source=?';args.push(f.source)}
 if(f.q){w+=" AND instr(COALESCE(name,'')||' '||COALESCE(address,''),?)>0";args.push(f.q)}
 if(f.genre){w+=" AND instr(COALESCE(genre,''),?)>0";args.push(f.genre)}
 w+=bankWhere(f,bank,args);
 // Keep source IDs distinct. Never merge different physical assets using approximate match_key.
 const fields="property_id AS id,source,source_url,name,address,pref,station,line,walk_min,genre,price_man,gross_yield,rent_year_man,structure,built_year,land_m2,building_m2,units,rebuild_ok,hazard,first_seen,last_seen,notion_page,"+bank+" AS bank,CAST("+score+" AS REAL) AS score,"+path('総合ランク')+" AS rank,"+stage+" AS pipeline,"+sale+" AS sale,"+path('次の一手')+" AS next_action,"+path('主なリスク')+" AS top_risk";
 const order=f.sort==='new'?'first_seen DESC,property_id':'score DESC,gross_yield DESC,last_seen DESC,property_id';
 const useIndex=(f.mode==='new'||f.mode==='inventory')&&f.sort==='new'&&f.area==='all'&&f.source==='all'&&f.bank==='all'&&!f.q&&!f.genre;
 const from='properties'+(useIndex?' INDEXED BY idx_prop_web_first_seen':'');
 return {args,count:"SELECT count(*) n FROM "+from+" WHERE "+w,rows:"SELECT "+fields+" FROM "+from+" WHERE "+w+" ORDER BY "+order+" LIMIT ? OFFSET ?"};
}
export async function liveSearch(db:D1Database,f:Search,limit=25){
 const q=liveSql(f);const run=async<T>(sql:string,a:unknown[])=>{const r=await db.prepare(sql).bind(...a).all<T>();if(!r.success)throw Error('query_failed');return r.results??[]};
 const [n,rows]=await Promise.all([run<{n:number}>(q.count,q.args),run<Record<string,unknown>>(q.rows,[...q.args,limit,(f.page-1)*limit])]);
 return {total:n[0]?.n??0,rows,page:f.page,limit};
}
export async function sourceStats(db:D1Database){const r=await db.prepare("SELECT source,count(*) n,sum(status='active') active,sum(first_seen=date('now','+9 hours')) new_today,max(last_seen) last_seen FROM properties GROUP BY source ORDER BY n DESC").all();if(!r.success)throw Error('query_failed');return r.results??[]}
export async function liveGet(db:D1Database,id:string,source:string){
 if(!id||id.length>160)throw Error('invalid_id');
 const sql=source==='ranking'?"SELECT * FROM v_rank_active WHERE COALESCE(NULLIF(property_id,''),rid)=? ORDER BY CASE WHEN list='reco' THEN 0 ELSE 1 END,pos LIMIT 1":"SELECT * FROM properties WHERE property_id=? LIMIT 1";
 const r=await db.prepare(sql).bind(id).all();if(!r.success)throw Error('query_failed');return r.results?.[0]??null;
}
export {PREFS};
