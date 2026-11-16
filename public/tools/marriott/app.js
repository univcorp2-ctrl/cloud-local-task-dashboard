/*DATA-START*/
// d8=2026-12-08泊（1室1名）の現金料金と必要pt。alt=別の日の例（mixed=現金とptの日付が違う推定）。weak=裏付けが弱い例
const D = window.HOTEL_DATA || {hotels:[],cap:110000,face:85000,dealFull:150000,weights:{deal:45,lux:25,perk:20,ease:10},updated:"",baseDate:""};
const H = D.hotels, W = D.weights;
const CAP = D.cap, FACE = D.face;
function basis(h){
  if(h.d8 && h.d8.pts<=CAP) return {cash:h.d8.cash, pts:h.d8.pts, kind:"d8", f:1, label:"2026-12-08泊"};
  if(h.alt) return {cash:h.alt.cash, pts:h.alt.pts, kind:"alt", f:0.8, label:h.alt.label, mixed:h.alt.mixed};
  if(h.weak) return {cash:h.weak.cash, pts:h.weak.pts, kind:"weak", f:0.4, label:h.weak.label, mixed:true};
  return null;
}
const saved = h => { const b=basis(h); return b ? b.cash - Math.max(0,b.pts-FACE) : null; };
const ypp = h => { const b=basis(h)||h.d8; return b ? b.cash/b.pts : null; };
const perkScore = h => (h.lounge==="ok"?2:h.lounge==="mid"?0.5:0) + (h.bf==="ok"?1:h.bf==="mid"?0.3:0) + (h.up==="ok"?1:h.up==="mid"?0.4:0);
function parts(h){
  const b=basis(h);
  const deal = b ? Math.min(W.deal, saved(h)/D.dealFull*W.deal)*b.f : 0;
  const lux = (h.lux+h.grade)/20*W.lux;
  const perk = perkScore(h)/4*W.perk;
  const ease = (!b ? 0 : b.kind==="d8" ? (b.pts<=FACE?1:0.7) : b.kind==="alt" ? 0.4 : 0.1)*W.ease;
  return {deal,lux,perk,ease,total:deal+lux+perk+ease};
}
const total = h => parts(h).total;
const extraCost = h => h.lounge==="ok" ? 0 : (h.clubFee && h.clubFee[1]>0 ? h.clubFee[0] : Infinity);
/*DATA-END*/

const yen = n => "¥" + Math.round(n).toLocaleString("ja-JP");
const pt  = n => n.toLocaleString("ja-JP") + "pt";
const label = {ok:"○", ng:"✕", mid:"△"};
const byTotal = (a,b)=> total(b)-total(a);
const sorters = {
  total:byTotal,
  saved:(a,b)=> (saved(b)??-1)-(saved(a)??-1) || byTotal(a,b),
  value:(a,b)=> (ypp(b)??-1)-(ypp(a)??-1),
  lux:(a,b)=> b.lux-a.lux || byTotal(a,b),
  grade:(a,b)=> b.grade-a.grade || b.lux-a.lux,
  perk:(a,b)=> perkScore(b)-perkScore(a) || byTotal(a,b),
  pts:(a,b)=> ((basis(a)||a.d8).pts)-((basis(b)||b.d8).pts),
  pts_desc:(a,b)=> ((basis(b)||b.d8).pts)-((basis(a)||a.d8).pts),
  extra:(a,b)=> extraCost(a)-extraCost(b) || byTotal(a,b)
};
const filters = {
  usable:h=>!!basis(h),
  lounge:h=>h.lounge==="ok",
  breakfast:h=>h.bf==="ok",
  no_topup:h=>{const b=basis(h); return !!b && b.pts<=FACE;},
  top:h=>h.top,
  tokyo:h=>h.region==="tokyo",
  kansai:h=>h.region==="kansai"
};
const active = new Set(["usable"]);

function metric(key, cur, name, val, pct){
  return `<div class="m${key===cur?" sorted":""}"><span>${name}</span><b class="num">${val}</b>${pct!=null?`<div class="bar"><i style="width:${Math.max(3,Math.min(100,pct))}%"></i></div>`:""}</div>`;
}
function statusTag(h){
  const b=basis(h);
  if(!b) return `<span class="tag t-ng">対象外（12/8は${pt(h.d8.pts)}）</span>`;
  if(b.kind==="d8") return `<span class="tag t-ok">${b.pts<=FACE?"85kだけで可":"上乗せ"+pt(b.pts-FACE)}</span>`;
  if(b.kind==="alt") return `<span class="tag t-mid">日を選べば可</span>`;
  return `<span class="tag t-mid">使える日は未確認</span>`;
}
function exTxt(h){ return h.lounge==="ok" ? "0円（無料）" : (h.clubFee && h.clubFee[1]>0) ? `${yen(h.clubFee[0])}〜${yen(h.clubFee[1])}` : "不可／未確認"; }
function curVal(h,cur){
  const b=basis(h), s=saved(h), v=ypp(h);
  switch(cur){
    case "saved": return s!=null? yen(s) : "—";
    case "value": return v!=null? v.toFixed(2)+"円/pt" : "—";
    case "lux": return h.lux+"/10";
    case "grade": return h.grade+"/10";
    case "perk": return perkScore(h).toFixed(1)+"/4";
    case "pts": case "pts_desc": return pt((b||h.d8).pts);
    case "extra": return exTxt(h);
    default: return parts(h).total.toFixed(0)+"点";
  }
}
function render(){
  const cur = document.getElementById("sort").value;
  const rows = H.filter(h=>[...active].every(f=>filters[f](h))).sort(sorters[cur]);
  document.getElementById("count").textContent = `${rows.length}件／全${H.length}件`;
  const el = document.getElementById("list");
  if(!rows.length){ el.innerHTML = `<p class="note">この条件に合うホテルはありません。絞り込みを1つ外してください。</p>`; return; }
  el.innerHTML = rows.map((h,i)=>{
    const b=basis(h);
    return `<a class="rowlink${b?"":" out"}" href="#h-${h.id}">
      <span class="r num">${i+1}</span>
      <span><span class="n">${h.name}</span><small>${h.area}・${b? pt(b.pts) : "対象外 "+pt(h.d8.pts)}・ラウンジ${label[h.lounge]} 朝食${label[h.bf]} 昇格${label[h.up]}</small></span>
      <span class="v num">${curVal(h,cur)}</span>
    </a>`;
  }).join("");
}
function detailHTML(h){
  const b=basis(h), p=parts(h), s=saved(h), v=ypp(h), cur="";
  const ptsTxt = b ? pt(b.pts) : pt(h.d8.pts);
  const basisTxt = b ? `${b.label}：現金${yen(b.cash)}／${pt(b.pts)}${b.mixed?"（推定）":""}` : `2026-12-08泊：現金${yen(h.d8.cash)}／${pt(h.d8.pts)}（上限超え）`;
  return `<a class="back" href="#list">← ホテル一覧に戻る</a>
    <div class="hhead">
      <h2 style="border:none;padding:0">${h.url?`<a href="${h.url}" target="_blank" rel="noopener">${h.name}</a>`:h.name}</h2>
      <div class="tags"><span class="tag">${h.area}</span><span class="tag">${h.brand}</span>${statusTag(h)}</div>
    </div>
    <div class="metrics">
      ${metric("total",cur,"総合点", p.total.toFixed(0)+"/100", p.total)}
      ${metric("saved",cur,"浮く金額", s!=null? yen(s)+(b.mixed?"※":""):"—", s!=null? s/150000*100:null)}
      ${metric("value",cur,"コスパ（円/pt）", v!=null? v.toFixed(2):"—", v!=null? v/2.1*100:null)}
      ${metric("lux",cur,"ラグジュアリー度", h.lux+"/10", h.lux*10)}
      ${metric("grade",cur,"ブランドの格", h.grade+"/10", h.grade*10)}
      ${metric("perk",cur,"プラチナ特典", perkScore(h).toFixed(1)+"/4", perkScore(h)/4*100)}
      ${metric("pts",cur,"必要pt", ptsTxt, null)}
      ${metric("extra",cur,"ラウンジ追加費用", exTxt(h), null)}
    </div>
    <div class="benefits">
      <div class="b ${h.lounge}"><em>ラウンジ ${label[h.lounge]}</em>${h.loungeTxt}</div>
      <div class="b ${h.bf}"><em>朝食 ${label[h.bf]}</em>${h.bfTxt}</div>
      <div class="b ${h.up}"><em>アップグレード ${label[h.up]}</em>${h.upTxt}</div>
    </div>
    <dl class="opts">
      <div><dt>数字の根拠</dt><dd>${basisTxt}${h.altNote?"。"+h.altNote:""}</dd></div>
      <div><dt>点数の内訳</dt><dd class="num">お得度${p.deal.toFixed(0)}＋格${p.lux.toFixed(0)}＋特典${p.perk.toFixed(0)}＋取りやすさ${p.ease.toFixed(0)}</dd></div>
      <div><dt>狙い方</dt><dd>${h.how}</dd></div>
      ${h.extraNote?`<div><dt>追加料金</dt><dd>${h.extraNote}</dd></div>`:""}
      ${h.caveat?`<div><dt>注意</dt><dd>${h.caveat}</dd></div>`:""}
    </dl>
    <p>${h.url?`<a href="${h.url}" target="_blank" rel="noopener">ホテル公式ページを開く ↗</a>`:`<span class="note">公式ページのリンク未取得</span>`}　<a href="#extras">このホテルの追加料金を計算する →</a></p>`;
}
const VIEWS = ["list","summary","extras","rules","about"];
function route(){
  const hash = (location.hash||"").slice(1);
  let view = "list";
  const hotel = hash.startsWith("h-") ? H.find(x=>x.id===hash.slice(2)) : null;
  if(hotel){
    view = "detail";
    document.getElementById("detail").innerHTML = detailHTML(hotel);
    sel.value = hotel.id; syncPts(); calc();
  } else if(VIEWS.includes(hash)) view = hash;
  document.querySelectorAll("[data-view]").forEach(e=>{ e.hidden = e.dataset.view!==view; });
  document.querySelectorAll("[data-nav]").forEach(a=>{
    if(a.dataset.nav===(view==="detail"?"list":view)) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
  });
  window.scrollTo(0,0);
}
function renderTop(){
  const rows = H.filter(h=>basis(h)).sort(byTotal).slice(0,5);
  document.getElementById("top").innerHTML = rows.map((h,i)=>{
    const b=basis(h), s=saved(h);
    return `<li><span class="r num">${i+1}</span><span><a href="#h-${h.id}"><b>${h.name}</b></a><small>浮く金額 ${yen(s)}${b.mixed?"（推定）":""}／${pt(b.pts)}／ラウンジ${label[h.lounge]}・朝食${label[h.bf]}・昇格${label[h.up]}</small></span><span class="s num">${total(h).toFixed(0)}点</span></li>`;
  }).join("");
}
document.getElementById("sort").addEventListener("change", render);
document.querySelectorAll(".chip").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const f = btn.dataset.f;
    if(active.has(f)){active.delete(f); btn.setAttribute("aria-pressed","false");}
    else{active.add(f); btn.setAttribute("aria-pressed","true");}
    render();
  });
});

// シミュレーター
const sel = document.getElementById("c-hotel");
sel.innerHTML = H.map(h=>`<option value="${h.id}">${h.name}</option>`).join("");
sel.value = "ritz-osaka";
const ptsIn = document.getElementById("c-pts");
function syncPts(){ const h = H.find(x=>x.id===sel.value); ptsIn.value = (basis(h)||h.d8).pts; }
function calc(){
  const h = H.find(x=>x.id===sel.value);
  const p = Number(ptsIn.value)||0;
  const people = Math.max(1, Number(document.getElementById("c-people").value)||1);
  const club = document.getElementById("c-club").checked;
  const bf = document.getElementById("c-bf").checked;
  const lines = [];
  if(p>CAP){ lines.push(`<b>この日は使えません</b>：${pt(p)}は上限110,000ptを超えています。別の日を探してください。`); }
  else{
    const top = Math.max(0, p-FACE);
    lines.push(top>0 ? `上乗せポイント：<b class="num">${pt(top)}</b>` : `上乗せポイント：<b>不要</b>（${pt(FACE-p)}分は使い残しになります）`);
  }
  let lo=0, hi=0; const notes=[];
  const paidClub = h.lounge!=="ok" && h.clubFee && h.clubFee[1]>0;
  if(club){
    if(h.lounge==="ok"){ notes.push("ラウンジは特典で無料なので、変更は不要です"); }
    else if(paidClub){ lo+=h.clubFee[0]; hi+=h.clubFee[1]; notes.push(`クラブ変更 ${yen(h.clubFee[0])}〜${yen(h.clubFee[1])}（1室・ラウンジの朝食込み）`); }
    else { notes.push("このホテルはラウンジがないか、変更料金が未確認です"); }
  }
  if(bf){
    if(h.bf==="ok" || (club && paidClub)){ notes.push("朝食は特典かラウンジに含まれるので追加なし"); }
    else if(h.bfPrice){ lo+=h.bfPrice*people; hi+=h.bfPrice*people; notes.push(`朝食 ${yen(h.bfPrice)}×${people}人＝${yen(h.bfPrice*people)}`); }
    else { notes.push("朝食料金は未確認（現地で確認）"); }
  }
  if(h.hawaii){ notes.push("リゾート料金 1泊52ドルが別にかかります"); }
  lines.push(`追加の現金：<b class="num">${lo===hi? yen(lo) : yen(lo)+"〜"+yen(hi)}</b>`);
  if(notes.length) lines.push(`<span class="note">${notes.join("／")}</span>`);
  document.getElementById("c-out").innerHTML = lines.join("<br>");
}
sel.addEventListener("change", ()=>{syncPts(); calc();});
["c-pts","c-club","c-bf","c-people"].forEach(id=>document.getElementById(id).addEventListener("input", calc));
document.getElementById("c-club").checked = true;
if(D.updated) document.getElementById("upd").textContent = D.updated;
if(!H.length) document.getElementById("list").innerHTML = '<p class="note">データファイル（data/hotels.js）を読み込めませんでした。ページを再読み込みしてください。</p>';
else { syncPts(); calc(); renderTop(); render(); route(); window.addEventListener("hashchange", route); }
