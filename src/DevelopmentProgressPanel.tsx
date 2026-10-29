import { useCallback, useEffect, useMemo, useState } from 'react';
import './development-progress.css';
import DashboardDirectory from './DashboardDirectory';
import './development-priority.css';

type Milestone = { id: string; label: string; weight: number; verified: boolean };
type Project = {
  name: string; url: string; category: string; description: string;
  progressPercent: number; confidence: string; phase: string;
  nextAction: string; lastAction: string; lastActionResult: string;
  actionStatus: string; inspectedAt: string; milestones: Milestone[];
};
type ActiveProject = {
  id: string; title: string; priority: string; progressPercent: number;
  confidence: string; executionStatus: string; nextAction: string;
  lastActionResult: string; inspectedAt: string; phase: string;
};
type Category = {
  id: string; name: string; repositoryCount: number; privateRepositoryCount: number;
  averageEvidenceProgress: number | null;
};
type ProgressCatalog = {
  generatedAt: string; progressDefinition: string;
  coverage: { allRepositories: number; public: number; private: number; inspected: number };
  averageProgress: number; categories: Category[]; publicProjects: Project[];
  activeProjects?: ActiveProject[];
};
const PROGRESS_PATH = '/data/development-progress.json';
const NOTION = 'https://app.notion.com/p/3fe10562e58b8112a282e19707783c79';
const format = (v: string) => { const d=new Date(v);return Number.isNaN(d.getTime())?'不明':d.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); };
export default function DevelopmentProgressPanel() {
  const [data,setData] = useState<ProgressCatalog | null>(null);
  const [error,setError] = useState('');
  const [category,setCategory]=useState('all');
  const [sort,setSort]=useState('priority');
  const [query,setQuery]=useState('');
  const [phase,setPhase]=useState('all');
  const [showCompleted,setShowCompleted]=useState(false);
  const [doneIds,setDoneIds]=useState<string[]>([]);
  const [busy,setBusy]=useState<string|null>(null);
  const [completionError,setCompletionError]=useState('');
  const [taskMatches,setTaskMatches]=useState<Array<{id:string;title:string;completed:boolean}>>([]);
  const load=useCallback(async()=>{
    try{
      const response=await fetch(PROGRESS_PATH+'?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const body=await response.json() as ProgressCatalog;
      if(!body.coverage||!Array.isArray(body.publicProjects)||!Array.isArray(body.activeProjects)||body.coverage.public!==body.publicProjects.length)throw Error('Invalid coverage');
      setData(body);setError('');
    }catch{setError('開発進捗の検証済みデータを取得できません。サンプル進捗率は表示しません。');}
  },[]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),180000);return()=>window.clearInterval(timer);},[load]);
  const projects=useMemo(()=>{
    const values=(data?.publicProjects??[]).filter(x=>(category==='all'||x.category===category)&&
      (phase==='all'||x.phase===phase)&&
      (x.name+' '+x.description+' '+x.nextAction).toLowerCase().includes(query.toLowerCase()));
    return values.sort((a,b)=>sort==='high'?b.progressPercent-a.progressPercent||a.name.localeCompare(b.name):
      sort==='low'?a.progressPercent-b.progressPercent||a.name.localeCompare(b.name):
      a.actionStatus.localeCompare(b.actionStatus)||b.progressPercent-a.progressPercent||a.name.localeCompare(b.name));
  },[data,category,phase,sort,query]);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [notionApi,setNotionApi]=useState<'checking'|'working'|'auth_missing'|'login_needed'|'error'>('checking');
  useEffect(()=>{
    let active=true;
    const check=async()=>{
      try{
        const response=await fetch('/api/private-tasks?showCompleted=true',{cache:'no-store',credentials:'same-origin'});
        if(!active)return;
        if(response.status===503){setNotionApi('auth_missing');return;}
        if(response.status===401||response.status===403){setNotionApi('login_needed');return;}
        if(!response.ok){setNotionApi('error');return;}
        const data:unknown=await response.json();
        const tasks=data && typeof data==='object' ? (data as {tasks?:unknown}).tasks : undefined;
        if (Array.isArray(tasks)) {
          setTaskMatches(tasks.filter((x): x is {id:string;title:string;completed:boolean} =>
            Boolean(x) && typeof x==='object' && typeof x.id==='string' && typeof x.title==='string')
            .map(x=>({id:x.id,title:x.title,completed:Boolean(x.completed)})));
          setNotionApi('working');
        } else setNotionApi('error');
      }catch{if(active)setNotionApi('error');}
    };
    void check();
    return()=>{active=false;};
  },[]);
  // Only exact unique Notion title matches are allowed to mutate task state.
  // Partial/similar names can refer to unrelated tasks.
  const resolveTask=(title:string)=>{
    const norm=(v:string)=>v.normalize('NFKC').toLowerCase().replace(/[\s　]+/g,'').trim();
    const matches=taskMatches.filter(t=>norm(t.title)===norm(title));
    return matches.length===1 ? matches[0] : null;
  };
  async function completeDevelopment(id:string,title:string,checked:boolean) {
    if (!checked || busy || notionApi!=='working') return;
    const task=resolveTask(title);
    if (!task || task.completed) { setCompletionError('この開発案件に対応するNotionタスクを一意に特定できません。更新を中止しました。'); return; }
    setBusy(id);setCompletionError('');
    try {
      const response=await fetch('/api/private-tasks',{method:'PATCH',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({id:task.id,completed:true})});
      if (!response.ok) throw Error('Notionへの完了保存に失敗しました');
      const saved=await response.json() as {ok?:boolean;auditLogged?:boolean};
      if (!saved.ok) throw Error('Notionの完了応答が未確認です');
      setDoneIds(prev=>[...prev,id]);
      setTaskMatches(prev=>prev.map(x=>x.id===task.id?{...x,completed:true}:x));
      if (saved.auditLogged===false) setCompletionError('完了はNotionに反映されましたが、操作ログ追記に失敗しました。');
    }catch(e){setCompletionError(e instanceof Error?e.message:'Notion更新失敗');}
    finally{setBusy(null);}
  }
  return <section className="development-panel" aria-label="開発プロジェクト進捗・次アクション">
    <div className="dev-header">
      <div><span className="section-kicker">PROJECT DELIVERY / SOURCE-BASED</span>
        <h2>開発進捗・次のアクション</h2><p>完了の証拠を確認した項目だけ加点。開発仕様全体の完成率ではなく、共通の検証マイルストーン達成度です。</p></div>
      <a href={NOTION} target="_blank" rel="noreferrer">非公開60件を含むNotion台帳 ↗</a>
    </div>
    <DashboardDirectory />
    {error&&<p role="alert" className="usage-error">{error}</p>}
    {completionError&&<p role="alert" className="usage-error">{completionError}</p>}
    <div className="dev-completion-tools">
      <button type="button" className="refresh-button" aria-pressed={showCompleted} onClick={()=>setShowCompleted(v=>!v)}>
        {showCompleted?'未完了のみ表示':'完了済みも表示'}
      </button>
      <small>左端の完了チェックはNotionと一意に紐付く案件だけ有効。未認証・未紐付けは変更しません。</small>
    </div>
    <div className="dev-active-header"><h3>開発課題・次アクション一覧</h3><span>重要度順／{data?.activeProjects?.length ?? 0}案件</span></div>
    <div className="dev-active-table-scroll" role="region" aria-label="開発の進捗とスタック一覧">
      <table className="dev-active-table"><thead><tr>
        <th>完了</th><th>優先</th><th>開発案件</th><th>進捗</th><th>状態・スタック箇所</th><th>次のアクション</th>
      </tr></thead><tbody>
      {(data?.activeProjects ?? []).filter(p=>showCompleted || (!doneIds.includes(p.id) && !resolveTask(p.title)?.completed)).map((p,i) => {
        const linked=resolveTask(p.title);
        const isCompleted=doneIds.includes(p.id)||Boolean(linked?.completed);
        const privateTasksBlocked = p.id === 'web' && notionApi !== 'working';
        const blocked = privateTasksBlocked || /異常|失敗|未検証|未確認|停止|エラー|未達/.test(p.executionStatus);
        const statusText = privateTasksBlocked && notionApi === 'auth_missing' ? 'Notion本人タスクAPI 503：Cloudflare Access未設定' :
          privateTasksBlocked && notionApi === 'login_needed' ? 'Notion本人タスクAPI：ログイン認証が必要' :
          privateTasksBlocked && notionApi === 'error' ? 'Notion本人タスクAPI：取得失敗・原因調査中' :
          privateTasksBlocked ? 'Notion本人タスク接続の確認中' : p.executionStatus;
        const nextAction = privateTasksBlocked ?
          'Cloudflare Access認証・Notion Pages Secretsを正規設定し、タスク表示と完了PATCHのE2Eを検証' : p.nextAction;
        return <tr key={p.id} className={blocked ? 'dev-is-blocked' : ''}>
          <td><input type="checkbox" aria-label={p.title+'を完了'} title={linked?'Notionタスクに完了を保存':'Notionの対応タスクが未確認です'}
            checked={isCompleted} disabled={!linked || notionApi!=='working' || Boolean(busy) || isCompleted}
            onChange={e=>void completeDevelopment(p.id,p.title,e.target.checked)}/></td>
          <td className="dev-active-index">{i+1}</td>
          <td><strong title={p.title}>{p.title}</strong><small>{p.priority} · 最終確認 {format(p.inspectedAt)}</small></td>
          <td className="dev-active-progress"><strong>{p.progressPercent}%</strong><div className="dev-meter"><span style={{width:p.progressPercent+'%'}}/></div></td>
          <td><span className={blocked ? 'dev-block-indicator blocked' : 'dev-block-indicator'}>{blocked ? '要対応' : '進行中'}</span>
            <span className="dev-cell-detail" title={statusText}>{statusText}</span>
            <small className="dev-cell-detail" title={p.lastActionResult}>{p.lastActionResult}</small></td>
          <td><span className="dev-cell-action" title={nextAction}>{nextAction}</span></td>
        </tr>;
      })}
      </tbody></table>
      {!data && <p className="usage-empty">開発データを読み込んでいます。</p>}
    </div>
    <details className="dev-full-inventory"><summary>全153リポジトリの進捗・カテゴリー一覧を開く（詳細台帳）</summary>
    <div className="dev-kpis">
      <div><span>検証ベース平均進捗</span><strong>{data?data.averageProgress.toFixed(1)+'%':'—'}</strong><small>全リポジトリ対象・単純平均</small></div>
      <div><span>確認済みリポジトリ</span><strong>{data?data.coverage.inspected:'—'}<small> 件</small></strong><small>GitHub最新版を検査</small></div>
      <div><span>公開画面の詳細</span><strong>{data?data.coverage.public:'—'}<small> 件</small></strong><small>公開repoのみ名称掲載</small></div>
      <div><span>非公開リポジトリ</span><strong>{data?data.coverage.private:'—'}<small> 件</small></strong><small>集計のみ・詳細はNotion</small></div>
    </div>
    {data&&<>
      <h3 className="dev-subtitle">カテゴリー別の平均進捗 <small>全153件を含む、未検証項目は0点</small></h3>
      <div className="dev-category-grid">
        {data.categories.map(cat=><button key={cat.id} type="button"
          className={'dev-category'+(category===cat.id?' selected':'')}
          aria-pressed={category===cat.id} onClick={()=>setCategory(category===cat.id?'all':cat.id)}>
          <span className="dev-category-top"><strong>{cat.name}</strong><b>{cat.averageEvidenceProgress===null?'未算出':cat.averageEvidenceProgress.toFixed(0)+'%'}</b></span>
          <span className="dev-meter"><span style={{width:(cat.averageEvidenceProgress??0)+'%'}} /></span>
          <small>{cat.repositoryCount} repo（非公開 {cat.privateRepositoryCount}）</small>
        </button>)}
      </div>
      <div className="dev-filterbar">
        <div><h3>プロジェクト別の次アクション</h3><small>{projects.length} / {data.coverage.public} 公開repoを表示</small></div>
        <input aria-label="開発プロジェクト検索" placeholder="プロジェクト名・アクションを検索" value={query} onChange={e=>setQuery(e.target.value)}/>
        <select aria-label="開発段階" value={phase} onChange={e=>setPhase(e.target.value)}>
          <option value="all">すべての開発段階</option>
          {Array.from(new Set(data.publicProjects.map(x=>x.phase))).map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select aria-label="進捗ソート" value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="priority">次に検証する順</option><option value="high">進捗率の高い順</option><option value="low">進捗率の低い順</option>
        </select>
        {category!=='all'&&<button type="button" className="dev-clear" onClick={()=>setCategory('all')}>全カテゴリへ戻る</button>}
      </div>
      <div className="dev-project-list">
        {projects.map(p=><article key={p.name} className="dev-project-row">
          <div className="dev-project-top">
            <div><a href={p.url} target="_blank" rel="noreferrer">{p.name} ↗</a><small>{p.phase} · 根拠の充実度 {p.confidence==='high'?'高':p.confidence==='medium'?'中':'低'}</small></div>
            <span className="dev-percent">{p.progressPercent}%</span>
          </div>
          <div className="dev-meter"><span style={{width:p.progressPercent+'%'}} /></div>
          <div className="dev-next"><b>次のアクション：</b>{p.nextAction}</div>
          <div className="dev-result"><b>実行したこと／結果：</b>{p.lastActionResult}</div>
          <button type="button" className="dev-details" aria-expanded={expanded===p.name}
            onClick={()=>setExpanded(expanded===p.name?null:p.name)}>{expanded===p.name?'根拠を閉じる':'進捗の採点根拠を表示'}</button>
          {expanded===p.name&&<div className="dev-milestones">
            {p.milestones.map(m=><div key={m.id} className={m.verified?'confirmed':'unverified'}>
              <span>{m.verified?'✓':'—'}</span><span>{m.label}</span><b>{m.verified?m.weight:0} / {m.weight}点</b>
            </div>)}
            <p>直近の実施：{p.lastAction}。確認：{format(p.inspectedAt)}。未実施の次工程を「完了」とは扱いません。</p>
          </div>}
        </article>)}
      </div>
      {!projects.length&&<p className="usage-empty">条件に該当する公開リポジトリはありません。</p>}
      <p className="dev-footnote">最終検査：{format(data.generatedAt)}。進捗率は「設計15・実装25・テスト存在10・テスト成功10・自動化構成10・実行成功10・公開検証10・業務成果10」の合計。製品要件の完全な完成率を意味しません。非公開リポジトリの名称・URL・未公開作業内容はWebに載せません。新しい収集が成功した場合だけ更新します。</p>
    </>}
      </details>
  </section>;
}
