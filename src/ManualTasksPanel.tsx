import { useEffect, useMemo, useState } from 'react';
type Task = { id:string;url:string;title:string;category:string;priority:string;status:string;owner:string;executor:string;due:string|null;nextAction:string;humanAction:string };
const notion = 'https://www.notion.so/5f61a18de1f84eac84ac355126311f8b';
const views = [
  {label:'カテゴリ別・未完了', url:notion+'?v=3fe10562e58b811c8743000cd773607c'},
  {label:'本人対応', url:notion+'?v=3fe10562e58b81e9bb57000c9c0cef2b'},
  {label:'AI担当', url:notion+'?v=3fe10562e58b81c99413000c3823cb61'},
];
const rank = (s:string) => s.includes('最高')?0:s.includes('高')?1:s.includes('中')?2:3;
export default function ManualTasksPanel(){
  const [tasks,setTasks]=useState<Task[]|null>(null);
  const [message,setMessage]=useState('データ接続を確認中');
  const [category,setCategory]=useState('すべて');
  const [lane,setLane]=useState('すべて');
  const [search,setSearch]=useState('');
  useEffect(()=>{let active=true;fetch('/api/private-tasks',{cache:'no-store'}).then(async r=>{
    if(!r.ok)throw new Error(r.status===503?'認証・Notion連携が未設定です':'認証が必要、または取得できません');
    const data=await r.json() as {tasks?:Task[];truncated?:boolean};
    if(!Array.isArray(data.tasks))throw new Error('不正な応答');
    if(active){setTasks(data.tasks);setMessage(data.truncated?'一部のみ取得':'Notionと同期済み');}
  }).catch(e=>{if(active)setMessage(e instanceof Error?e.message:'取得できません');});return()=>{active=false};},[]);
  const categories=useMemo(()=>['すべて',...new Set((tasks||[]).map(t=>t.category||'未分類'))], [tasks]);
  const filtered=useMemo(()=>(tasks||[]).filter(t=>(category==='すべて'||t.category===category)
    &&(lane==='すべて'||(lane==='本人対応'&&(t.owner.includes('人間')||t.executor==='Hiro'||!!t.humanAction))||(lane==='AI担当'&&(t.owner.includes('AI')||t.executor.includes('CLI')||t.executor.includes('ChatGPT'))))
    &&(t.title+' '+t.nextAction).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>rank(a.priority)-rank(b.priority)||(a.due||'9999').localeCompare(b.due||'9999')),[tasks,category,lane,search]);
  return <section className="work-dashboard" id="my-tasks">
    <div className="panel"><span className="section-kicker">NOTION TASKS</span><h2>全タスク・本人のやること</h2><p>Notionを正本に、カテゴリー・担当・期限で確認します。既存タスクは削除しません。</p>
      <div className="work-links">{views.map(v=><a key={v.label} href={v.url} target="_blank" rel="noreferrer">{v.label} ↗</a>)}</div>
    </div>
    <div className="panel"><div className="panel-heading"><h2>未完了タスク</h2><span>{tasks?tasks.length+'件':message}</span></div>
    {tasks ? <><div className="work-controls">
      <select aria-label="担当で絞り込み" value={lane} onChange={e=>setLane(e.target.value)}>{['すべて','本人対応','AI担当'].map(v=><option key={v}>{v}</option>)}</select>
      <select aria-label="カテゴリで絞り込み" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(v=><option key={v}>{v}</option>)}</select>
      <input aria-label="タスク検索" value={search} onChange={e=>setSearch(e.target.value)} placeholder="タスク検索" />
    </div><p>表示 {filtered.length}件</p><div className="work-items">
    {filtered.map(t=><article key={t.id}><div><small>{t.category||'未分類'} ・ {t.priority} ・ {t.status}</small><h3><a href={t.url} target="_blank" rel="noreferrer">{t.title} ↗</a></h3><p>{t.nextAction||'次の一手は未設定'}</p></div><div><small>{t.owner} ・ {t.due||'期限なし'}</small></div></article>)}
    </div></> : <p className="work-private">個人のタスクは一般公開しません。Cloudflare AccessとNotion連携の設定後に表示します。それまでは上のNotionリンクを利用できます。</p>}
    </div>
  </section>;
}