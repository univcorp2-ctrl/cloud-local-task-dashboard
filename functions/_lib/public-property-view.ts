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
const axes=[['エリア',22],['融資評価',20],['利回り割安度',16],['土地出口',16],['決算書への影響',15],['融資期間・残債利回り',11]] as const;
const angles=['決算書・格付け','売りやすさ・流動性','収益力','融資の付きやすさ','土地値','立地'] as const;
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
   const label=score===null?'未採点・再照合':score+'点 / 100';
   const s=obj(raw.scores),ang=obj(raw.angles);
   const detail=axes.map(([k,max])=>{const ar=s[k],v=Array.isArray(ar)&&ar[1]===max?num(ar[0],max):null;return '<tr><td>'+esc(k)+'</td><td>'+(v??'未確認')+' / '+max+'</td></tr>'}).join('');
   const angleRows=angles.map(k=>'<tr><td>'+esc(k)+'</td><td>'+(num(obj(ang[k]).score,100)??'未確認')+' / 100</td></tr>').join('');
   return '<article><details><summary><strong>'+esc(label)+'</strong>　旧評価・内訳</summary><table>'+detail+angleRows+'</table></details><h2>'+esc(a.name)+'</h2><p>'+esc(a.genre)+'｜'+esc(a.area)+'</p><p class="hint">'+(conflict?'旧採点の種別矛盾：再採点待ち':'広告ページ取得確認済・販売状況は未確定')+'</p><a href="'+esc(a.url)+'" rel="noopener noreferrer">公開掲載元を開く</a></article>';
 }).join('');
 return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>統一物件ダッシュボード｜閲覧用</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#17352c;background:#f4f6f4;margin:0}main{max-width:780px;margin:auto;padding:14px}h1{font-size:24px}h2{font-size:19px}article,form,.box{background:white;border:1px solid #d1dbd5;border-radius:12px;padding:14px;margin:12px 0}label{display:block;margin:6px 0}select,input,button{font:inherit;min-height:42px;width:100%;box-sizing:border-box}button{background:#17665b;color:white;border:0;border-radius:7px}summary{cursor:pointer;color:#17665b}summary strong{font-size:24px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:6px}a{color:#12655b}.hint{font-size:14px;color:#59685f}</style><main><h1>統一物件ダッシュボード</h1><p>認証不要・公開広告の閲覧専用</p><div class="box">公開取得確認：2026-11-28。掲載ページの存在は成約・販売中の保証ではありません。旧採点順（再検証前）。非公開資料・メール・融資交渉・お気に入りは非表示。</div><form action="/api/public-properties" method="get"><label>物件種別<select name="genre">'+options([...new Set(PUBLIC_ADS.map(a=>a.genre))],kind,'全種別')+'</select></label><label>エリア<select name="area">'+options([...new Set(PUBLIC_ADS.map(a=>a.area))],area,'全エリア')+'</select></label><label>物件名<input name="q" value="'+esc(q)+'"></label><label>並び<select name="sort">'+options(['score','listing'],sort,'点数順（既定）')+'</select></label><button>検索・更新</button></form><p>'+candidates.length+'件｜確認済み公開広告のみ</p>'+cards+'<p><a href="/">接続済み端末の管理画面</a></p></main></html>',{headers:baseHeaders});
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
