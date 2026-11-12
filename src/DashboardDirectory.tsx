import { useEffect, useMemo, useState } from 'react';
import './dashboard-directory.css';

type DashboardLink = {
  id:string;name:string;category:string;url:string;
  status:'public'|'login'|'partial'|'preview';note:string;
};
type Directory = {schemaVersion:number;links:DashboardLink[];registrationUrl:string};
const labels:Record<DashboardLink['status'],string>={
  public:'公開画面',login:'要認証',partial:'一部要確認',preview:'検証版'
};
const FAV_KEY='tcc.favoriteLinks.v1';
const FAV_EVENT='tcc-favorites-changed';
function readFavs():string[]{
  try{const v:unknown=JSON.parse(window.localStorage.getItem(FAV_KEY)??'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];}
  catch{return [];}
}
/** お気に入り（このブラウザだけに保存。他の端末・他の人には共有されない） */
function useFavorites(){
  const [favs,setFavs]=useState<string[]>(()=>readFavs());
  useEffect(()=>{
    const sync=()=>setFavs(readFavs());
    window.addEventListener(FAV_EVENT,sync);window.addEventListener('storage',sync);
    return()=>{window.removeEventListener(FAV_EVENT,sync);window.removeEventListener('storage',sync);};
  },[]);
  const toggle=(id:string)=>{
    const cur=readFavs();const next=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id];
    try{window.localStorage.setItem(FAV_KEY,JSON.stringify(next));}catch{/* Private browsing can block storage. */}
    setFavs(next);window.dispatchEvent(new Event(FAV_EVENT));
  };
  return {favs,toggle};
}
function safeUrl(value:unknown) {
  try {const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password;}
  catch{return false;}
}
export default function DashboardDirectory({mode='directory'}:{mode?:'directory'|'pinned'}){
  const [data,setData]=useState<Directory|null>(null);
  const [query,setQuery]=useState('');
  const [error,setError]=useState(false);
  const {favs,toggle}=useFavorites();
  useEffect(()=>{
    let active=true;
    fetch('/data/dashboard-links.json',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw Error('dashboard links fetch failed');
      const body:unknown=await r.json();
      if(!body||typeof body!=='object'||!Array.isArray((body as Directory).links))
        throw Error('invalid registry');
      const value=body as Directory;
      if(active) setData({...value,links:value.links.filter(x=>
        typeof x.id==='string'&&typeof x.name==='string'&&typeof x.category==='string'&&safeUrl(x.url))});
    }).catch(()=>{if(active)setError(true)});
    return()=>{active=false};
  },[]);
  const found=useMemo(()=>(data?.links||[]).filter(x=>
    [x.name,x.category,x.note,x.id].some(v=>v.toLowerCase().includes(query.toLowerCase()))),[data,query]);
  const favLinks=useMemo(()=>favs.map(id=>(data?.links||[]).find(x=>x.id===id)).filter((x):x is DashboardLink=>!!x),[data,favs]);
  const card=(x:DashboardLink)=>{const on=favs.includes(x.id);return <div className="tcc-directory-item" key={x.id}>
    <a href={x.url} target="_blank" rel="noopener noreferrer" title={x.note}>
      <span><strong>{x.name}</strong><span aria-hidden="true">↗</span></span>
      <small>{labels[x.status]} · {x.note}</small>
    </a>
    <button type="button" className={'tcc-fav'+(on?' on':'')} aria-pressed={on}
      aria-label={(on?'お気に入りから外す：':'お気に入りに追加：')+x.name} title={on?'お気に入りから外す':'お気に入りに追加'}
      onClick={()=>toggle(x.id)}>{on?'★':'☆'}</button>
  </div>;};
  const favSection=favLinks.length>0?<div className="tcc-directory-pinned tcc-directory-favs" aria-label="お気に入りリンク">
      <h3>⭐ お気に入り</h3><div className="tcc-directory-grid">{favLinks.map(card)}</div></div>:null;
  const PINNED='資金調達';
  const pinned=useMemo(()=>(data?.links||[]).filter(x=>x.category===PINNED),[data]);
  const groups=useMemo(()=>Array.from(new Set(found.map(x=>x.category))).filter(c=>c!==PINNED),[found]);
  if(mode==='pinned')return (pinned.length>0||favSection)?<section className="tcc-directory" aria-label="お気に入り・資金調達リンク">
    {favSection}
    {pinned.length>0&&<div className="tcc-directory-pinned" aria-label="資金調達（最優先リンク）">
      <h3>💰 資金調達（最優先）</h3>
      <div className="tcc-directory-grid">{pinned.map(card)}</div>
    </div>}</section>:null;
  return <section className="tcc-directory" aria-label="統合Webダッシュボード一覧">
    <details>
      <summary><strong>🔗 統合Webアプリ一覧・リンク追加</strong>
        <span>{data?data.links.length+'画面':'読み込み中'} · GitHub／Drive／Notionと連携する共通入口</span></summary>
      <div className="tcc-directory-main">
        <div className="tcc-directory-controls">
          <input aria-label="Webアプリの名前で検索" placeholder="画面名・分野を検索" value={query}
            onChange={e=>setQuery(e.target.value)}/>
          <a href="https://docs.google.com/spreadsheets/d/1O8OoxxzNH91wRFdTjyx56Jr6l-_KIdQjUVFeoliuUVM/edit"
            target="_blank" rel="noopener noreferrer">＋ 自分でリンクを追加 ↗</a>
        </div>
        {error&&<p>リンク一覧を取得できません。Google Sheetsの登録台帳を参照してください。</p>}
        {groups.map(category=><div className="tcc-directory-group" key={category}>
          <h3>{category}</h3><div className="tcc-directory-grid">
            {found.filter(x=>x.category===category).map(card)}
          </div></div>)}
        {data&&found.length===0&&<p>検索に一致する登録Webアプリはありません。</p>}
        <p className="tcc-directory-note">☆を押すとトップの「⭐ お気に入り」に固定されます（このブラウザだけに保存）。新しいWebリンクは上記の登録台帳へ記入できます。現在はAIがURL・公開許諾を確認してJSON台帳に転記する方式で、Webへの無審査自動公開は行いません。</p>
      </div>
    </details>
  </section>;
}
