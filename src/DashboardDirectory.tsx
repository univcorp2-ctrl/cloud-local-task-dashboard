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
function safeUrl(value:unknown) {
  try {const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password;}
  catch{return false;}
}
export default function DashboardDirectory(){
  const [data,setData]=useState<Directory|null>(null);
  const [query,setQuery]=useState('');
  const [error,setError]=useState(false);
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
  const groups=useMemo(()=>Array.from(new Set(found.map(x=>x.category))),[found]);
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
            {found.filter(x=>x.category===category).map(x=><a href={x.url} key={x.id}
              target="_blank" rel="noopener noreferrer" title={x.note}>
              <span><strong>{x.name}</strong><span aria-hidden="true">↗</span></span>
              <small>{labels[x.status]} · {x.note}</small>
            </a>)}
          </div></div>)}
        {data&&found.length===0&&<p>検索に一致する登録Webアプリはありません。</p>}
        <p className="tcc-directory-note">新しいWebリンクは上記の登録台帳へ記入できます。現在はAIがURL・公開許諾を確認してJSON台帳に転記する方式で、Webへの無審査自動公開は行いません。</p>
      </div>
    </details>
  </section>;
}
