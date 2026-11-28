import {cards} from './kanashin';
const esc=(x:unknown)=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const PREFS=['東京都','神奈川県','埼玉県','千葉県','群馬県','栃木県','茨城県','宮城県','静岡県','北海道','青森県','岩手県','秋田県','山形県','福島県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'] as const;
const BANKS:Record<string,{label:string;aliases:string[]}>={
 kanashin:{label:'かながわ信金（専用ランキング）',aliases:[]},
 all:{label:'全銀行・融資未確認を含む（統一DB）',aliases:[]},
 kanashin_db:{label:'かながわ信金（統一DB記載）',aliases:['かながわ信金','かながわ信用金庫','神奈川信金','神奈川の信金','神奈川信用金庫']},
 shizuoka:{label:'静岡銀行',aliases:['静岡銀行']},jfc:{label:'日本政策金融公庫',aliases:['日本政策金融公庫']},
 resona:{label:'りそな銀行',aliases:['りそな銀行']},yokohama:{label:'横浜銀行',aliases:['横浜銀行']},chiba:{label:'千葉銀行',aliases:['千葉銀行']},
 shichijushichi:{label:'七十七銀行',aliases:['七十七銀行']},kobe:{label:'神戸信用金庫',aliases:['神戸信用金庫','神戸信金']},
 asuka:{label:'あすか信用組合',aliases:['あすか信用組合','あすか信組','飛鳥信用組合']},kiraboshi:{label:'きらぼし銀行',aliases:['きらぼし銀行']},
 gunma:{label:'群馬銀行',aliases:['群馬銀行']},tochigi:{label:'栃木銀行',aliases:['栃木銀行']},ashikaga:{label:'足利銀行',aliases:['足利銀行']}
};
export function parseFilters(url:string){const q=new URL(url).searchParams;const bank=q.get('bank')??'kanashin',area=q.get('area')??'all';const pg=Number(q.get('page')??1);return {bank:Object.prototype.hasOwnProperty.call(BANKS,bank)?bank:'kanashin',area:area==='unknown'||(PREFS as readonly string[]).includes(area)?area:'all',page:Number.isSafeInteger(pg)?Math.min(10000,Math.max(1,pg)):1}}
export type Filters=ReturnType<typeof parseFilters>;
const kanagawa=/^(?:横浜|川崎|横須賀|相模原|鎌倉|藤沢|平塚|小田原|茅ヶ崎|逗子|三浦|秦野|厚木|大和|伊勢原|海老名|座間|南足柄|綾瀬)市/;
const tokyo=/^(?:町田|八王子|立川|武蔵野|三鷹|青梅|府中|昭島|調布|小金井|小平|日野|東村山|国分寺|国立|福生|狛江|東大和|清瀬|東久留米|武蔵村山|多摩|稲城|羽村|あきる野|西東京)市|^(?:千代田|中央|港|新宿|文京|台東|墨田|江東|品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|北|荒川|板橋|練馬|足立|葛飾|江戸川)区/;
export function areaOf(name:string){return PREFS.find(p=>name.startsWith(p))??(kanagawa.test(name)?'神奈川県':tokyo.test(name)?'東京都':'unknown')}
const label=(x:string)=>x==='unknown'?'所在地未確認':x==='all'?'全エリア':x;
const query=(f:Filters,page=1,mode='')=>'?'+new URLSearchParams({bank:f.bank,area:f.area,page:String(page),...(mode?{mode}:{})}).toString();
const styles='<style id="property-filters">.pf{background:#fff;border:1px solid #cad6d3;border-radius:10px;padding:12px;margin:12px 0}.pf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pf label{display:block;font-size:13px;font-weight:bold}.pf select,.pf button{width:100%;font:inherit;min-height:44px;border:1px solid #aab9b5;border-radius:6px;background:#fff;color:#172924;padding:6px}.pf button{background:#0f5c56;color:#fff;border:0;font-weight:bold;margin-top:10px}.pf-quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.pf-quick a,.pf-page a{display:inline-block;padding:8px 10px;border:1px solid #aab9b5;border-radius:6px;text-decoration:none;color:#164c48}.pf-quick a[aria-current=true]{background:#0f5c56;color:#fff}.pf small{display:block;color:#465650;margin-top:8px}.pf-page{display:flex;gap:10px;align-items:center;justify-content:center;margin:14px 0}.pf-meta{font-size:14px;color:#465650}.pf-card{overflow-wrap:anywhere}.pf-card h2{font-size:17px}.pf-card .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:480px){.pf-grid{grid-template-columns:1fr}.pf select{font-size:16px}}</style>';
export function filterPanel(f:Filters,counts?:Record<string,number>){
 const options=Object.entries(BANKS).map(([v,b])=>'<option value="'+esc(v)+'"'+(v===f.bank?' selected':'')+'>'+esc(b.label)+'</option>').join('');
 const areas=['all',...PREFS,'unknown'].map(v=>'<option value="'+esc(v)+'"'+(v===f.area?' selected':'')+'>'+esc(label(v))+(counts&&v!=='all'?' ('+(counts[v]??0)+')':'')+'</option>').join('');
 const quick=['all','東京都','神奈川県','埼玉県','千葉県','群馬県','栃木県','茨城県','宮城県','静岡県'].map(v=>'<a href="'+esc(query({...f,area:v}))+'" aria-current="'+(v===f.area)+'">'+esc(label(v))+'</a>').join('');
 return '<div class="pf" id="property-filter"><strong>銀行・エリアで絞り込み</strong><form method="get" action="/api/private-kanashin"><div class="pf-grid"><label for="pf-bank">銀行・対象DB<select id="pf-bank" name="bank">'+options+'</select></label><label for="pf-area">所在地<select id="pf-area" name="area">'+areas+'</select></label></div><button type="submit">絞り込む</button></form><div class="pf-quick">'+quick+'</div><small>銀行は記録された候補名で抽出。融資承認・営業エリアの確約ではありません。所在地は独立して指定できます。</small></div>';
}
export function filterKanashin(html:string,f:Filters){
 const all=cards(html);const counts:Record<string,number>={};for(const c of all){const a=areaOf(c.name);counts[a]=(counts[a]??0)+1}
 const selected=all.filter(c=>f.area==='all'||areaOf(c.name)===f.area);const ids=new Set(selected.map(c=>c.id));
 if(f.area!=='all'){
   html=html.replace(/<section\b([^>]*\bdata-key="([^"]+)"[^>]*)>([\s\S]*?)<\/section>/g,(s,_a,id)=>ids.has(id)?s:'');
   html=html.replace(/<section class="card"><h2>[\s\S]*?新規候補・未照合・ランキング対象外[\s\S]*?<\/section>/g,'');
 }
 const notice='<div class="box" role="status"><strong>'+esc(label(f.area))+'：'+selected.length+' / '+all.length+' 候補行</strong><p>かながわ信金専用ランキングの所在地別表示。上部の判定表は全体集計です。</p>'+(selected.length===0?'<p>このエリアの専用候補はありません。<a href="'+esc(query({...f,bank:'all'}))+'">統一DBの同じエリアを表示</a></p>':'')+'</div>';
 return html.replace('</head>',styles+'</head>').replace(/(<\/header>)/,'$1'+filterPanel(f,counts)+notice);
}
type MasterRow={property_id:string;name:string|null;address:string|null;pref:string|null;station:string|null;walk_min:number|null;price_man:number|null;gross_yield:number|null;rent_year_man:number|null;structure:string|null;built_year:number|null;genre:string|null;bank:string|null;score:number|null;sale:string|null;source_url:string|null;notion_page:string|null;last_seen:string|null;rank:string|null;pipeline:string|null};
const path=(key:string)=>"json_extract(raw_json,'$.notion.\""+key+"\"')";
const BANK=path('融資候補銀行'), SCORE=path('総合点'), SALE=path('販売確認'), RANK=path('総合ランク'), PIPE=path('パイプライン段階');
export function masterWhere(f:Filters){const conditions=["source='notion'","status='active'","json_valid(raw_json)","COALESCE("+SALE+",'') NOT IN ('掲載終了','販売終了','成約済','売却済')"],args:unknown[]=[];
 if(f.area==='unknown')conditions.push("(pref IS NULL OR trim(pref)='')");
 else if(f.area!=='all'){conditions.push('pref=?');args.push(f.area)}
 const bank=BANKS[f.bank];if(bank.aliases.length){conditions.push('('+bank.aliases.map(()=>'instr(COALESCE('+BANK+",''),?)>0").join(' OR ')+')');args.push(...bank.aliases)}
 return {where:conditions.join(' AND '),args};
}
export async function masterQuery(db:D1Database,f:Filters){
 const run=async<T>(sql:string,args:unknown[])=>{const r=await db.prepare(sql).bind(...args).all<T>();if(!r.success)throw Error('query_failed');return r.results??[]};
 const {where,args}=masterWhere(f);const {where:allWhere,args:allArgs}=masterWhere({...f,area:'all'});
 const [n,groups,rows]=await Promise.all([
  run<{n:number}>('SELECT count(*) n FROM properties WHERE '+where,args),
  run<{pref:string|null;n:number}>('SELECT pref,count(*) n FROM properties WHERE '+allWhere+' GROUP BY pref',allArgs),
  run<MasterRow>('SELECT property_id,name,address,pref,station,walk_min,price_man,gross_yield,rent_year_man,structure,built_year,genre,'+BANK+' AS bank,CAST('+SCORE+' AS REAL) AS score,'+SALE+' AS sale,'+RANK+' AS rank,'+PIPE+' AS pipeline,source_url,notion_page,last_seen FROM properties WHERE '+where+' ORDER BY score DESC, last_seen DESC,property_id LIMIT ? OFFSET ?',[...args,25,(f.page-1)*25])
 ]);
 const counts:Record<string,number>={};for(const g of groups)counts[g.pref||'unknown']=g.n;return {total:n[0]?.n??0,counts,rows};
}
const safeLink=(url:unknown,caption:string)=>{try{const u=new URL(String(url));if(u.protocol!=='https:'||u.username||u.password)return '';return '<a class="btn ghost" target="_blank" rel="noopener noreferrer" href="'+esc(u.href)+'">'+esc(caption)+'</a>'}catch{return ''}};
const fmt=(v:unknown,suffix:string)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('ja-JP')+suffix:'調査中';
export function renderMaster(f:Filters,data:Awaited<ReturnType<typeof masterQuery>>){
 const total=data.total,pages=Math.max(1,Math.ceil(total/25));
 const body=data.rows.map(r=>'<section class="card pf-card"><h2>'+esc(r.name||'名称調査中')+'</h2><p>'+esc(r.address||r.pref||'所在地調査中')+'</p><p class="pf-meta">'+esc(r.station||'駅調査中')+' / '+fmt(r.walk_min,'分')+' / '+esc(r.structure||'構造調査中')+' / '+fmt(r.built_year,'年築')+'</p><div class="kpis"><div><span>価格</span><b>'+fmt(r.price_man,'万円')+'</b></div><div><span>表面利回り</span><b>'+fmt(r.gross_yield,'%')+'</b></div><div><span>年間家賃</span><b>'+fmt(r.rent_year_man,'万円')+'</b></div><div><span>総合点（正本記録）</span><b>'+fmt(r.score,'点')+'</b></div></div><p>候補銀行：'+esc(r.bank||'未記録・要確認')+'</p><p>種別：'+esc(r.genre||'調査中')+' ／ 販売確認：'+esc(r.sale||'未確認')+' ／ 段階：'+esc(r.pipeline||'未記録')+'</p><p class="pf-meta">DB更新：'+esc(r.last_seen||'不明')+' ／ かながわ信金式の判定・融資承認は未実施</p><div class="pf-quick">'+safeLink(r.source_url,'掲載元')+safeLink(r.notion_page,'Notion正本')+'</div></section>').join('');
 const pager='<div class="pf-page">'+(f.page>1?'<a href="'+esc(query(f,f.page-1,'inventory'))+'">前へ</a>':'')+'<span>'+f.page+' / '+pages+' ページ</span>'+(f.page<pages?'<a href="'+esc(query(f,f.page+1,'inventory'))+'">次へ</a>':'')+'</div>';
 return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>物件一覧｜銀行・エリア</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f5f1;color:#1c2422;font:15px/1.65 system-ui,sans-serif}.wrap{max-width:860px;margin:auto;padding:14px}.card{background:#fff;border:1px solid #d9dedb;border-radius:9px;padding:14px;margin:12px 0}.kpis{display:grid;gap:6px}.kpis div{background:#e6efed;padding:8px;border-radius:5px}.kpis span{display:block;font-size:12px}.kpis b{font-size:18px}.pf-card p{margin:5px 0}h1{font-size:23px}</style>'+styles+'</head><body><main class="wrap"><header><h1>統一物件DB｜銀行・エリア別</h1><p>社内用・Notion同期データ</p></header>'+filterPanel(f,data.counts)+'<div class="pf"><a href="'+esc(query(f))+'">精査候補ランキングへ戻る</a><br><strong>'+esc(BANKS[f.bank].label)+' × '+esc(label(f.area))+'：'+total+'件</strong><small>Notion由来のactive行（明示的な販売終了を除く）。現在の販売・融資適格性を保証する件数ではありません。25件ずつ、記録上の総合点順。かながわ信金専用ランキングとは別集計。</small></div>'+pager+(body||'<div class="card">該当候補がありません。銀行を「全銀行」に変更して検索できます。</div>')+pager+'</main></body></html>';
}
