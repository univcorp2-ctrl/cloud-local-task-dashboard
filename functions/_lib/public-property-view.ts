import {propertyCss,scorePanel} from './unified-property-render';
/** Public read-only projection. No private records, owner IDs, raw notes, links or favorites. */
export const PUBLIC_ADS = [
 {url:'https://www.rakumachi.jp/syuuekibukken/kanto/tokyo/dim1003/3810802/show.html',name:'東京都大田区',genre:'商業ビル',area:'東京都',conflict:true},
 {url:'https://www.rakumachi.jp/syuuekibukken/kanto/chiba/dim1004/3807463/show.html',name:'千葉県船橋市',genre:'戸建',area:'千葉県'},
 {url:'https://www.rakumachi.jp/syuuekibukken/kanto/kanagawa/dim1002/3806493/show.html',name:'横浜市磯子区',genre:'一棟アパート',area:'神奈川県',conflict:true},
 {url:'https://www.rakumachi.jp/syuuekibukken/kanto/chiba/dim1004/3758248/show.html',name:'千葉県船橋市',genre:'戸建',area:'千葉県'},
 {url:'https://www.rakumachi.jp/syuuekibukken/kanto/saitama/dim1004/3806514/show.html',name:'埼玉県川越市',genre:'戸建',area:'埼玉県',conflict:true},
 {url:'https://suumo.jp/chukoikkodate/saitama/sc_tokorozawa/nc_21725490/',name:'所沢市狭山ケ丘2丁目（狭山ヶ丘駅）',genre:'戸建',area:'埼玉県'},
 {url:'https://suumo.jp/chukoikkodate/saitama/sc_tsurugashima/nc_22117727/',name:'鶴ヶ島市大字下新田（一本松駅）',genre:'戸建',area:'埼玉県'},
 {url:'https://www.kenbiya.com/pp8/s/saitama/etc/re_4762058mfk/',name:'入間郡越生町',genre:'戸建',area:'埼玉県'}
] as const;
// Exact public URLs independently retrieved anonymously on 2026-11-28.
// The list is deliberately bounded; a public URL in a private DB does not prove publication permission.
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type D=Record<string,unknown>;
function obj(v:unknown):D{return v&&typeof v==='object'&&!Array.isArray(v)?v as D:{}}
function num(v:unknown,max:number){return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max?v:null}
const baseHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
export function publicViewResponse(request:Request,rows:D[]=[]){
 const p=new URL(request.url).searchParams;const kind=p.get('genre')??'',area=p.get('area')??'',q=(p.get('q')??'').slice(0,80),sort=p.get('sort')??'score';
 const candidates=PUBLIC_ADS.filter(a=>(!kind||a.genre===kind)&&(!area||area==='all'||a.area===area)&&(!q||a.name.includes(q))).map(a=>{
  const hits=rows.filter(r=>r.url===a.url);const hit=hits.length===1?hits[0]:null;
  const conflict='conflict' in a&&a.conflict;const score=conflict?null:num(hit?.score,100);
  let raw:D={};try{raw=obj(JSON.parse(String(hit?.score_json??'{}')))}catch{/* omit unknown */}
  return {a,score,conflict,raw:score===null?{}:raw};
 });
 if(sort==='score')candidates.sort((a,b)=>(b.score??-1)-(a.score??-1));
 const options=(arr:string[],sel:string,all:string)=>'<option value="">'+all+'</option>'+arr.map(x=>'<option'+(x===sel?' selected':'')+' value="'+esc(x)+'">'+esc(x)+'</option>').join('');
 const cards=candidates.map(({a,score,conflict,raw},i)=>{
   const rank=score===null?null:score>=80?'A+':score>=70?'A':score>=60?'A-':score>=50?'B':score>=40?'C':'D';
   const status=conflict?'旧採点の種別矛盾・再採点待ち':'掲載取得確認・販売未確定';
   const metrics=[['価格','掲載元で確認'],['表面利回り','掲載元で確認'],['満室年家賃','未確認'],['建物構造','未確認']].map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('');
   return '<section class="card">'+scorePanel(score,rank,{scores:obj(raw.scores),angles:obj(raw.angles)})+'<div class="ch"><span class="no2">'+(i+1)+'</span><span class="tier">'+esc(status)+'</span></div><h2>'+esc(a.name)+'</h2><p class="sub">'+esc(a.area)+'｜'+esc(a.genre)+'</p><div class="kpis">'+metrics+'</div><details><summary>① 物件詳細</summary><p>公開広告を参照してください。非公開資料は表示しません。</p></details><details><summary>② リスク・販売状況</summary><p>'+esc(status)+'。成約・販売中の保証ではありません。</p></details><div class="links"><a class="btn" href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">掲載元</a></div></section>';
 }).join('');
 const tab=(label:string,href:string,active=false)=>'<a href="'+esc(href)+'" aria-current="'+active+'">'+esc(label)+'</a>';
 const tabs=tab('最新AIランキング','/api/public-properties?sort=score',sort==='score')+tab('公開物件一覧','/api/public-properties?sort=listing',sort!=='score')+tab('全件・保存分析（本人用）','/api/private-kanashin?mode=archive&bank=kanashin');
 return new Response('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>統一物件ダッシュボード</title><style>'+propertyCss+'.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid select,.grid input{min-width:0;max-width:100%}.kpis b{overflow-wrap:anywhere}.score-detail th,.score-detail td{overflow-wrap:anywhere}</style></head><body><main class="wrap"><header><h1>統一物件ダッシュボード</h1><p class="sub">認証不要・公開広告の閲覧専用</p></header><div class="box"><div class="kpis"><div><span>公開確認済み広告</span><b>'+PUBLIC_ADS.length+'件</b></div><div><span>表示条件</span><b>'+candidates.length+'件</b></div></div><p class="sub">2026-11-28取得確認。販売状況は未確定。旧採点順（再検証前）。非公開資料・メール・お気に入り編集は本人用画面のみ。</p></div><nav class="tabs">'+tabs+'</nav><form class="box" action="/api/public-properties" method="get"><div class="grid"><label>物件種別<select name="genre">'+options([...new Set(PUBLIC_ADS.map(a=>a.genre))],kind,'全種別')+'</select></label><label>エリア<select name="area">'+options([...new Set(PUBLIC_ADS.map(a=>a.area))],area,'全エリア')+'</select></label><label>物件名・住所<input name="q" value="'+esc(q)+'"></label><label>並び<select name="sort"><option value="score"'+(sort==='score'?' selected':'')+'>既存点数順</option><option value="listing"'+(sort==='listing'?' selected':'')+'>掲載順</option></select></label></div><button class="primary" style="width:100%;margin-top:10px">検索・更新</button></form><div class="box"><strong>公開広告：'+candidates.length+'件</strong><p class="sub">下へスクロールすると全件を確認できます。</p></div><div id="property-results">'+(cards||'<div class="box">該当する候補なし。</div>')+'</div><div class="box"><a class="btn" href="/">本人用接続設定</a></div></main></body></html>',{headers:baseHeaders});
}
export async function publicView(request:Request,db?:D1Database){
 let rows:D[]=[];
 // Narrow SQL projection: only score numbers/arrays for the exact reviewed public URLs.
 // Private notes/IDs/attachments are never included in the HTML.
 if(db){try{
 const urls=PUBLIC_ADS.map(a=>a.url);
 const placeholders=urls.map(()=>'?').join(',');
 const r=await db.prepare("SELECT p.source_url AS url,r.total_score AS score,json_object('scores',json_extract(CASE WHEN json_valid(r.raw_json) THEN r.raw_json ELSE '{}' END,'$.scores'),'angles',json_extract(CASE WHEN json_valid(r.raw_json) THEN r.raw_json ELSE '{}' END,'$.angles')) AS score_json FROM v_rank_active r JOIN v_property_rank_identity i ON i.rid=r.rid AND i.list=r.list JOIN properties p ON p.property_id=i.matched_source_id WHERE r.list='reco' AND p.source_url IN ("+placeholders+")").bind(...urls).all<D>();
 if(r.success)rows=r.results??[];
 }catch{/* fail closed for scores, not for public ads */}}
 return publicViewResponse(request,rows);
}
