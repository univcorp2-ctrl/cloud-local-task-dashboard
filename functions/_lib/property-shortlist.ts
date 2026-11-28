import {masterWhere,type Filters} from './property-filters';
const p=(key:string)=>"json_extract(raw_json,'$.notion.\""+key+"\"')";
const sale=p('販売確認'),stage=p('パイプライン段階'),status=p('ステータス'),next=p('次の一手'),score=p('総合点');
const excluded=['見送り','買付済','成約済','売却済','掲載終了','販売終了','重複統合済','失効','紹介停止','HOLD','本人承認待ち','本人GO待ち','外部回答待ち'];
const quote=(v:string)=>"'"+v.replace(/'/g,"''")+"'";
const deny=excluded.map(quote).join(',');
export function shortlistCte(f:Filters){
 const {where,args}=masterWhere(f);
 const lane="CASE WHEN genre IN ('戸建','戸建て') AND gross_yield>=20 THEN '戸建て・20%以上保有精査' WHEN genre IN ('戸建','戸建て') THEN '戸建て・転売/保有再検証' WHEN genre='中古アパート' THEN '中古一棟' WHEN genre='新築アパート' THEN '新築一棟' WHEN genre='土地' THEN '土地' ELSE 'その他・種別確認' END";
 const identity="CASE WHEN COALESCE(trim(address),'')<>'' AND COALESCE(trim(name),'')<>'' AND price_man IS NOT NULL THEN trim(address)||'|'||trim(name)||'|'||price_man ELSE property_id END";
 // No new investment score. Preserve the canonical score, exact-row duplicate grouping, and separate queues by location and asset type.
 const cte="WITH base AS (SELECT property_id,name,address,pref,city,town,station,walk_min,price_man,gross_yield,rent_year_man,structure,built_year,genre,rebuild_ok,hazard,source_url,notion_page,last_seen,"+p('融資候補銀行')+" AS bank,CAST("+score+" AS REAL) AS score,"+sale+" AS sale,"+p('総合ランク')+" AS rank,"+stage+" AS pipeline,"+p('主なリスク')+" AS risk,"+p('次の一手')+" AS next_action,"+p('積算比率（%）')+" AS collateral_ratio,"+lane+" AS lane,"+identity+" AS identity FROM properties WHERE "+where+" AND price_man>0 AND COALESCE("+stage+",'') NOT IN ("+deny+") AND COALESCE("+status+",'') NOT IN ("+deny+") AND COALESCE("+next+",'') NOT LIKE '%重複統合済%' AND COALESCE("+stage+",'') NOT LIKE '%重複統合%' AND COALESCE("+status+",'') NOT LIKE '%重複統合%' AND COALESCE(rebuild_ok,'') NOT IN ('不可','再建築不可','false','0') AND COALESCE(hazard,'') NOT IN ('赤','レッド','レッドゾーン') AND (genre IN ('土地','戸建','戸建て') OR gross_yield>0)), dedup AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY identity ORDER BY CASE WHEN sale IN ('販売中','掲載中') THEN 0 ELSE 1 END, last_seen DESC,score DESC,property_id) AS duplicate_rank FROM base), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY COALESCE(pref,''),lane ORDER BY CASE WHEN sale IN ('販売中','掲載中') THEN 0 ELSE 1 END,score DESC,gross_yield DESC,last_seen DESC,property_id) AS region_rank FROM dedup WHERE duplicate_rank=1), top AS (SELECT * FROM ranked WHERE region_rank<=10)";
 return {cte,args};
}
export async function shortlistQuery(db:D1Database,f:Filters){
 const {cte,args}=shortlistCte(f);const run=async<T>(sql:string,params:unknown[])=>{const r=await db.prepare(sql).bind(...params).all<T>();if(!r.success)throw Error('query_failed');return r.results??[]};
 const {cte:allCte,args:allArgs}=shortlistCte({...f,area:'all'});
 const [counts,rows]=await Promise.all([
  run<{pref:string|null;n:number}>(allCte+' SELECT pref,count(*) n FROM top GROUP BY pref',allArgs),
  run<Record<string,unknown>>(cte+' SELECT * FROM top ORDER BY pref,lane,region_rank,property_id LIMIT ? OFFSET ?',[...args,25,(f.page-1)*25])
 ]);
 const byArea:Record<string,number>={};for(const c of counts)byArea[c.pref||'unknown']=c.n;
 const total=f.area==='all'?counts.reduce((a,c)=>a+c.n,0):byArea[f.area]??0;
 // Read the existing sold comp table only; these are regional sample counts, not comparable-property validation.
 const regions=[...new Set(rows.map(r=>String(r.pref??'')).filter(Boolean))];const comp:Record<string,Record<string,number>>={};
 if(regions.length){const cr=await run<{pref:string;genre:string;n:number}>("SELECT pref,genre,count(DISTINCT comp_id) n FROM comps WHERE kind='sold' AND pref IN ("+regions.map(()=>'?').join(',')+") GROUP BY pref,genre",regions);for(const c of cr){(comp[c.pref]??={})[c.genre]=c.n}}
 return {total,counts:byArea,rows,comp};
}
