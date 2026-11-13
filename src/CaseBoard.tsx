import { useCallback, useEffect, useMemo, useState } from 'react';
import { authHeaders, fmtJst, useOwnerToken } from './controlState';
import './case-board.css';

type Task = {
  id:string;url:string;title:string;category:string;priority:string;status:string;
  owner:string;executor:string;assignedAi?:string;autonomy?:string;due:string|null;
  nextAction:string;humanAction:string;whyHuman?:string;executionStatus:string;
  completed:boolean;goal?:string;doneCriteria?:string;wbsSummary?:string;
  evidenceUrl?:string|null;linkStatus?:string;freshness?:string;lastEditedAt?:string|null;
};
type Action = {id:string;url:string;title:string;propertyId:string;action:string;result:string;
  channel:string;agency:string;occurredAt:string|null;evidenceUrl:string|null;
  driveFolder:string;listingUrl:string|null;note:string};
type Stream = {id:string;url:string;title:string;stage:string;actor:string;responsible:string;
  lastAction:string;updatedAt:string|null;verifiedAt:string|null;nextAction:string;due:string|null;
  blocker:string;humanDecision:string;evidenceUrl:string|null;contactCount:number|null;replyCount:number|null};
type Partner = {id:string;url:string;company:string;kind:string;pattern:string;channel:string;stage:string;
  assignedAi:string;need:string;response:string;benefit:string;sentAt:string|null;
  nextFollowupAt:string|null;threadUrl:string|null;updatedAt:string|null};
type Source<T> = {ok:boolean;truncated?:boolean;error?:string;items:T[]};
type Flow = {generatedAt:string;actions:Source<Action>;pipeline:Source<Stream>;partners?:Source<Partner>};
type Filters = 'all'|'hiro'|'blocked'|'unassigned'|'active';
const MASTER='https://app.notion.com/p/5f61a18de1f84eac84ac355126311f8b';
const PIPELINE='https://app.notion.com/p/67cfe9e3503444dc9e5aab80d47fa0ea';
const ACTION='https://app.notion.com/p/cebac40892384fc691fdea575e741ef2';
const PARTNERS='https://app.notion.com/p/8511fde8f57b467f870265dff7dd0e9a';
const BALLS=['Hiro','Claude','Codex','Antigravity','Muse','ChatGPT通常チャット','外部・相手先','担当未割当'];
const CHECK=/^(?:✅|☑|\[x\]|\[X\])\s*/;
const OPEN=/^(?:☐|□|⬜|\[ \])\s*/;
function milestone(text?:string){
  const parts=(text??'').split(/\n|→|＞/).map(x=>x.trim()).filter(Boolean);
  const done=parts.filter(x=>CHECK.test(x)).length;
  const todo=parts.filter(x=>OPEN.test(x)).length;
  return done+todo>=2?{percent:Math.round(done/(done+todo)*100),done,total:done+todo}:null;
}
export function ballOwner(t:Task){
  if(t.executor==='外部待ち'||t.status.includes('相手待ち'))return '外部・相手先';
  if(t.owner.includes('人間')||t.humanAction?.trim()||t.autonomy==='Hiro必須')return 'Hiro';
  const ai=t.assignedAi??'';
  if(ai.includes('Claude'))return 'Claude';
  if(ai.includes('Codex'))return 'Codex';
  if(ai.includes('Antigravity'))return 'Antigravity';
  if(ai.includes('Muse'))return 'Muse';
  if(ai.includes('Hiro'))return 'Hiro';
  if(t.executor==='ChatGPT追撃')return 'ChatGPT通常チャット';
  return '担当未割当';
}
export function isBlocked(t:Task){
  return /ブロック|エラー|停止|保留/.test(t.status+' '+t.executionStatus) || t.autonomy==='実行禁止';
}
export function requestLabel(a:Action) {
  if(a.action==='docs_received'||a.result==='docs_received')return '資料受領ログあり';
  if(a.result==='error')return '請求・連絡エラー';
  if(a.action==='request_docs'&&['sent','form_sent'].includes(a.result))return '請求記録あり・受領未照合';
  if(a.action==='request_docs')return '送信成否未検証';
  return a.result||a.action||'未確認';
}
const labelClass=(label:string)=>/ブロック|エラー|停止|未割当|未接続|未検証/.test(label)?'cb-negative':/受領|完了|済/.test(label)?'cb-good':'cb-neutral';
const age=(date:string|null|undefined)=>date?fmtJst(date):'未記録';
const sortTask=(a:Task,b:Task)=>Number(isBlocked(b))-Number(isBlocked(a)) ||
  Number(ballOwner(b)==='Hiro')-Number(ballOwner(a)==='Hiro') || (a.due??'9999').localeCompare(b.due??'9999');
const categories=['🏠 不動産・民泊','🏦 銀行・融資・補助金','🤝 営業・連絡','📦 物販・買取','⚙️ AI開発・自動化','🧾 確定申告・経理','🎯 経営・戦略','📝 事務・生活','📚 調査・学習','🔍 要確認'];
export default function CaseBoard({onConnect}:{onConnect:()=>void}){
  const [token]=useOwnerToken();
  const [tasks,setTasks]=useState<Task[]|null>(null);
  const [flow,setFlow]=useState<Flow|null>(null);
  const [error,setError]=useState('');
  const [category,setCategory]=useState('all');
  const [filter,setFilter]=useState<Filters>('all');
  const [actor,setActor]=useState('all');
  const [query,setQuery]=useState('');
  const [tab,setTab]=useState<'tasks'|'materials'|'pipeline'|'channels'>('tasks');
  const [updated,setUpdated]=useState('');
  const reload=useCallback(async()=>{
    try{
      const [taskResp,flowResp]=await Promise.all([
        fetch('/api/private-tasks',{headers:authHeaders(),credentials:'same-origin',cache:'no-store'}),
        fetch('/api/private-workflows',{headers:authHeaders(),credentials:'same-origin',cache:'no-store'})
      ]);
      if(!taskResp.ok)throw new Error(taskResp.status===401?'接続が必要です（認証トークンを確認）':
        taskResp.status===503?'Notion接続設定が未完了（HTTP 503）':`タスク取得エラー HTTP ${taskResp.status}`);
      const taskData=await taskResp.json() as {tasks?:Task[];generatedAt?:string;truncated?:boolean};
      if(!Array.isArray(taskData.tasks))throw new Error('Notionタスクの形式を確認できません');
      setTasks(taskData.tasks.filter(x=>!x.completed));
      setUpdated(taskData.generatedAt??new Date().toISOString());
      if(flowResp.ok){setFlow(await flowResp.json() as Flow)}else{setFlow(null)}
      setError(taskData.truncated?'タスクの一部のみ取得しました。件数を全件と扱わないでください。':'');
    }catch(e){setTasks(null);setFlow(null);setError(e instanceof Error?e.message:'データを取得できません')}
  },[]);
  useEffect(()=>{void reload();const id=window.setInterval(()=>void reload(),120000);return()=>window.clearInterval(id)},[reload,token]);
  const all=useMemo(()=>tasks??[],[tasks]);
  const types=useMemo(()=>[...new Set([...categories,...all.map(t=>t.category||'🔍 要確認')])].filter(c=>all.some(t=>t.category===c)),[all]);
  const filtered=useMemo(()=>all.filter(t=>(category==='all'||t.category===category)&&
    (actor==='all'||ballOwner(t)===actor)&&
    (filter==='all'||(filter==='hiro'&&ballOwner(t)==='Hiro')||
    (filter==='blocked'&&isBlocked(t))||(filter==='unassigned'&&ballOwner(t)==='担当未割当')||
    (filter==='active'&&!isBlocked(t)))&&
    (t.title+' '+t.nextAction+' '+t.goal+' '+t.category).toLowerCase().includes(query.toLowerCase())
  ).sort(sortTask),[all,category,actor,filter,query]);
  const actions=useMemo(()=>[...(flow?.actions.items??[])].sort((a,b)=>String(b.occurredAt??'').localeCompare(String(a.occurredAt??''))),[flow]);
  const streams=useMemo(()=>[...(flow?.pipeline.items??[])].sort((a,b)=>Number(Boolean(b.humanDecision||b.blocker))-Number(Boolean(a.humanDecision||a.blocker))),[flow]);
  const partners=useMemo(()=>[...(flow?.partners?.items??[])].sort((a,b)=>{
    const aStop=/断り|終了/.test(a.stage)?1:0, bStop=/断り|終了/.test(b.stage)?1:0;
    return aStop-bStop || (a.nextFollowupAt??'9999').localeCompare(b.nextFollowupAt??'9999')
  }),[flow]);
  const requests=useMemo(()=>{
    const byId=new Map<string,Action[]>();
    for(const a of actions) {const id=a.propertyId||a.listingUrl||a.title;if(!byId.has(id))byId.set(id,[]);byId.get(id)!.push(a)}
    return [...byId.values()].map(group=>{
      const received=group.find(a=>a.action==='docs_received'||a.result==='docs_received');
      const sent=group.find(a=>a.action==='request_docs'&&['sent','form_sent'].includes(a.result));
      const error=group.find(a=>a.result==='error');
      return {recent:group[0],label:received?'資料受領ログあり':sent?'請求記録あり・受領未照合':error?'請求・連絡エラー':'送信・受領未検証',evidence:received||sent||error||group[0]};
    })
  },[actions]);
  const stats=[
    ['未完了タスク',tasks?String(all.length):'—','全カテゴリ'],
    ['本人がボール',tasks?String(all.filter(t=>ballOwner(t)==='Hiro').length):'—','あなたの対応待ち'],
    ['停止・保留',tasks?String(all.filter(isBlocked).length):'—','原因を個別表示'],
    ['担当未割当',tasks?String(all.filter(t=>ballOwner(t)==='担当未割当').length):'—','引継ぎが必要']
  ];
  return <div className="case-board">
    <section className="cb-hero">
      <div><p className="eyebrow">TASK / CLIENT / COMMUNICATION OPERATIONS</p>
      <h2>案件・タスクの進捗管制</h2>
      <p>カテゴリを選ぶ → 誰がボールを持つか → 何が終わり、何が止まったか。データがない進捗率は表示しません。</p></div>
      <div className="cb-hero-side"><button onClick={()=>void reload()} type="button">↻ 最新データを確認</button><small>Notion取得 {age(updated)}</small></div>
    </section>
    <div className="cb-metrics">{stats.map(([name,note,desc])=><div key={name}><span>{name}</span><strong>{note}</strong><small>{desc}</small></div>)}</div>
    {tab==='tasks'&&<div className="cb-categories" role="group" aria-label="カテゴリで絞り込み">
      <button className={category==='all'?'selected':''} onClick={()=>setCategory('all')}>全カテゴリ <b>{all.length||'—'}</b></button>
      {types.map(cat=><button key={cat} className={cat===category?'selected':''} onClick={()=>setCategory(cat)}>{cat}<b>{all.filter(t=>t.category===cat).length}</b></button>)}
    </div>}
    <div className="cb-tabs" role="tablist" aria-label="業務の種類">
      {([['tasks','案件・マイタスク'],['materials','物件・資料請求'],['pipeline','顧客・営業・成約'],['channels','メール・LINE・Messenger']] as const).map(([key,label])=>
        <button type="button" role="tab" aria-selected={tab===key} key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}
    </div>
    {!tasks && <div className="cb-alert" role="alert"><strong>案件の実データは認証後にのみ表示されます。</strong><p>{error||'Notionから読み込み中です。'}</p><button type="button" className="cb-connect" onClick={onConnect}>接続・認証設定を開く</button> <a href={MASTER} target="_blank" rel="noreferrer">Notion正本を開く ↗</a></div>}
    {error&&tasks&&<p className="cb-alert" role="alert">{error}</p>}
    {tab==='tasks'&&<section className="cb-list">
      <div className="cb-toolbar"><div className="cb-filters">
        <select aria-label="ボールを持つ人" value={actor} onChange={e=>setActor(e.target.value)}>
          <option value="all">すべての担当</option>{BALLS.map(b=><option key={b} value={b}>{b}</option>)}</select>
        <select aria-label="作業状態" value={filter} onChange={e=>setFilter(e.target.value as Filters)}>
          <option value="all">すべての状態</option><option value="hiro">本人対応</option>
          <option value="blocked">停止・保留</option><option value="unassigned">担当未割当</option>
          <option value="active">進行可能</option></select>
        <input placeholder="案件名・依頼・次の一手で検索" aria-label="案件検索" value={query} onChange={e=>setQuery(e.target.value)}/></div>
        <span>表示 {tasks?filtered.length:'—'}件</span></div>
      {filtered.map(t=>{const owner=ballOwner(t);const done=milestone(t.wbsSummary);
        return <details className="cb-case" key={t.id}>
          <summary><span className="cb-case-title"><strong>{t.title}</strong><small>{t.category} · {t.priority}</small></span>
            <span className={'cb-chip '+labelClass(t.executionStatus||t.status)}>{t.executionStatus==='実行中'?'DB記録：実行中':t.executionStatus||t.status}</span>
            <span className="cb-owner"><small>ボール</small><b>{owner}</b></span>
            <span className="cb-progress"><small>進捗</small><b>{done?`${done.percent}%`:'未計測'}</b>{done&&<span className="cb-track"><i style={{width:done.percent+'%'}} /></span>}</span></summary>
          <div className="cb-case-body">
            <div><small>目標・完了条件</small><p>{t.goal||'目標未登録'}{t.doneCriteria?' ／ '+t.doneCriteria:''}</p></div>
            <div><small>完了・未完了の工程（WBS）</small><p className="cb-pre">{t.wbsSummary||'工程別の実績チェックが未登録。数字の進捗率は算出しません。'}</p></div>
            <div><small>現在の停止理由</small><p>{isBlocked(t)?(t.executionStatus+'／'+t.status):'明示された停止なし（実作業の完了は未検証）'}</p></div>
            <div><small>次の一手</small><p>{t.nextAction||'未記録：担当者に確認が必要'}</p></div>
            <div><small>担当／期限／鮮度</small><p>{owner} · {t.due?'期限 '+t.due.slice(0,10):'期限未設定'} · {t.freshness||'鮮度不明'}{t.lastEditedAt?' · 更新 '+age(t.lastEditedAt):''}</p></div>
            <div className="cb-links"><a href={t.url} target="_blank" rel="noreferrer">Notion原本 ↗</a>{t.evidenceUrl&&<a href={t.evidenceUrl} target="_blank" rel="noreferrer">成果物・証拠 ↗</a>}</div>
          </div>
        </details>})}
      {tasks&&filtered.length===0&&<p className="cb-empty">条件に一致する未完了タスクはありません。</p>}
    </section>}
    {tab==='materials'&&<section className="cb-list">
      <div className="cb-section-head"><div><h3>物件仕入れ・資料請求の追跡</h3><p>property_idを軸に同一物件の送信・受領履歴をまとめます。Gmail等の実受信は別途照合が必要です。</p></div><a href={ACTION} target="_blank" rel="noreferrer">仕入れログ正本 ↗</a></div>
      {flow?.actions.ok?requests.map(r=><details className="cb-case" key={r.recent.id}>
        <summary><span className="cb-case-title"><strong>{r.recent.title||r.recent.propertyId||'物件名未登録'}</strong><small>{r.recent.agency||'元付け未登録'} · {age(r.recent.occurredAt)}</small></span>
        <span className={'cb-chip '+labelClass(r.label)}>{r.label}</span></summary>
        <div className="cb-case-body"><p>最後の記録：{r.recent.action} ／ {r.recent.result||'結果未取得'} ／ {r.recent.channel||'媒体不明'}</p>
        <p>Drive保存先：{r.recent.driveFolder||'未記録（保存検証なし）'}</p>
        <div className="cb-links"><a href={r.recent.url} target="_blank" rel="noreferrer">Notion原本 ↗</a>{r.evidence.evidenceUrl&&<a href={r.evidence.evidenceUrl} target="_blank" rel="noreferrer">メール証拠 ↗</a>}{r.recent.listingUrl&&<a href={r.recent.listingUrl} target="_blank" rel="noreferrer">物件掲載 ↗</a>}</div></div>
      </details>):<p className="cb-alert">仕入れアクションログ：{flow?.actions.error||'接続未完了。空欄は資料未着と同義ではありません。'}</p>}
      {flow?.actions.ok&&requests.length===0&&<p className="cb-empty">記録なし。実際の請求・受領状況は未確認です。</p>}
    </section>}
    {tab==='pipeline'&&<section className="cb-list">
      <div className="cb-section-head"><div><h3>顧客紹介・売り先・アライアンス・AI商材</h3><p>営業ストリームの接触・返信・交渉・入金。個別の顧客リストとの紐付けがないものは「未紐付け」とします。</p></div><a href={PIPELINE} target="_blank" rel="noreferrer">営業パイプライン正本 ↗</a></div>
      <div className="cb-section-head cb-secondary-head"><div><h3>会社別：仕入れ営業・顧客紹介・アライアンス</h3><p>相手先ごとの要望、返信、次回フォロー日、担当AIを正本から表示します。媒体の実受信とは別です。</p></div><a href={PARTNERS} target="_blank" rel="noreferrer">会社別DB正本 ↗</a></div>
      {flow?.partners?.ok?partners.map(p=><details className="cb-case" key={p.id}>
        <summary>
          <span className="cb-case-title"><strong>{p.company||'会社名未登録'}</strong><small>{p.kind||'種別未登録'} · {p.channel||'媒体未登録'} · 最終更新 {age(p.updatedAt)}</small></span>
          <span className={'cb-chip '+labelClass(p.stage)}>{p.stage||'段階未登録'}</span>
          <span className="cb-owner"><small>ボール</small><b>{p.assignedAi||'担当未割当'}</b></span>
          <span className="cb-owner"><small>次回フォロー</small><b>{p.nextFollowupAt?.slice(0,10)||'未設定'}</b></span>
        </summary>
        <div className="cb-case-body">
          <div><small>相手のニーズ・紹介案件</small><p>{p.need||'記録なし'}</p></div>
          <div><small>返信・反応</small><p>{p.response||'反応未登録（未返信と断定しない）'}</p></div>
          <div><small>価値提案・協業パターン</small><p>{p.benefit||'未登録'} ／ {p.pattern||'分類なし'}</p></div>
          <div><small>送信・フォロー</small><p>{p.sentAt?.slice(0,10)||'送信日未記録'} → {p.nextFollowupAt?.slice(0,10)||'次回日付未設定'}{p.stage.includes('断り')?' ／ 連絡禁止': ''}</p></div>
          <div className="cb-links"><a href={p.url} target="_blank" rel="noreferrer">相手先のNotion記録 ↗</a>{p.threadUrl&&<a href={p.threadUrl} target="_blank" rel="noreferrer">Gmailスレッド ↗</a>}</div>
        </div>
      </details>):<p className="cb-alert">会社別営業DB：{flow?.partners?.error||'未取得（0件と見なさない）'}</p>}
      {flow?.partners?.ok&&partners.length===0&&<p className="cb-empty">会社別データなし（登録件数0の可能性）。</p>}
      <div className="cb-section-head cb-secondary-head"><div><h3>ストリーム全体：接触・返信・受注・入金</h3><p>会社別記録と全体の活動KPIを混同しません。</p></div></div>
      {flow?.pipeline.ok?streams.map(s=><details className="cb-case" key={s.id}>
        <summary><span className="cb-case-title"><strong>{s.title}</strong><small>{s.responsible||'担当タスク未設定'} · {age(s.updatedAt)}</small></span>
          <span className={'cb-chip '+labelClass(s.stage)}>{s.stage||'段階不明'}</span>
          <span className="cb-owner"><small>ボール</small><b>{s.humanDecision?'Hiro':s.actor||s.responsible||'担当未割当'}</b></span>
          <span className="cb-owner"><small>接触／返信</small><b>{s.contactCount??'—'} / {s.replyCount??'—'}</b></span></summary>
        <div className="cb-case-body"><div><small>直近の成果</small><p>{s.lastAction||'未記録'}</p></div>
          <div><small>停止理由・本人判断</small><p>{s.blocker||s.humanDecision||'記録なし'}</p></div>
          <div><small>次の一手と期限</small><p>{s.nextAction||'未登録'} ／ {s.due||'期限不明'}</p></div>
          <div className="cb-links"><a href={s.url} target="_blank" rel="noreferrer">Notion原本 ↗</a>{s.evidenceUrl&&<a href={s.evidenceUrl} target="_blank" rel="noreferrer">証拠 ↗</a>}</div></div></details>):<p className="cb-alert">営業パイプライン：{flow?.pipeline.error||'接続未完了'}</p>}
    </section>}
    {tab==='channels'&&<section className="cb-list">
      <div className="cb-section-head"><div><h3>媒体ごとの依頼・返信・ボール</h3><p>媒体ごとのメッセージID・顧客ID・案件IDを一致させた記録だけを統合対象とします。</p></div></div>
      <div className="cb-channel-grid">
        <div><strong>Gmail・メール</strong><span className="cb-chip cb-neutral">Notion送信・受領ログのみ</span><p>メール本文・新着・未返信数の直接同期は未検証。仕入れログで媒体=email/imapの原証を確認。</p><a href={ACTION} target="_blank" rel="noreferrer">メール活動ログ ↗</a></div>
        <div><strong>Messenger</strong><span className="cb-chip cb-negative">受信箱との直接同期未確認</span><p>過去のMessenger自動化システムは存在。ただし本画面への顧客別返信データ連携は未検証。</p><a href="https://app.notion.com/p/3fe10562e58b8162a842de13ef041be8" target="_blank" rel="noreferrer">既存システム台帳 ↗</a></div>
        <div><strong>LINE</strong><span className="cb-chip cb-negative">受信箱との直接同期未確認</span><p>LINE公式・個人LINEを混同しません。実受信・送信の確認は元システムの証拠IDが必要です。</p><a href="https://app.notion.com/p/40310562e58b811fb3c3e8859dcd2e66" target="_blank" rel="noreferrer">LINE実機監査 ↗</a></div>
      </div>
      <div className="cb-section-head cb-secondary-head"><div><h3>媒体が分かっている会社別の接触記録</h3><p>Notion営業DBの「経路」で絞った既存履歴です。Gmail・Messenger・LINEの全受信箱を読んだ結果ではありません。</p></div><a href={PARTNERS} target="_blank" rel="noreferrer">会社別DB ↗</a></div>
      {flow?.partners?.ok?partners.filter(p=>p.channel).map(p=><div className="cb-media-row" key={p.id}><a href={p.url} target="_blank" rel="noreferrer">{p.company||'相手先名未記録'}</a><span>{p.channel}</span><span>{p.stage||'状況未登録'}</span><span>担当：{p.assignedAi||'未割当'}</span>{p.need&&<small>依頼：{p.need}</small>}{p.response&&<small>反応：{p.response}</small>}</div>):<p className="cb-alert">媒体別営業履歴：{flow?.partners?.error||'未取得'}</p>}
      <p className="cb-alert">誰からのニーズか・何を依頼されたか・最後の返信・ボールの持ち主を完全に表示するには、各媒体の正規API／認証済み取り込みと共通案件IDの照合が未完了です。未接続を0件と表示しません。</p>
    </section>}
    <footer className="cb-footer">個人情報を公開JSONに保存しません。正本：既存Notion DB。画面は読み取り専用・認証必須。「実行中」はNotion台帳上の申告であり実稼働を保証しません。未検証進捗は数値化しません。</footer>
  </div>;
}
