import {useCallback,useEffect,useState} from 'react';
import {authHeaders,fmtJst,useOwnerToken} from './controlState';
import {health,type BackgroundRow} from '../functions/_lib/background';
import './background-ledger.css';
const DB='https://app.notion.com/p/41d10562e58b8128bed2ec3faeaac74d';
export default function BackgroundLedger(){
  const [token]=useOwnerToken();const [rows,setRows]=useState<BackgroundRow[]>([]);
  const [error,setError]=useState('');const [filter,setFilter]=useState('');const [loaded,setLoaded]=useState(false);
  const load=useCallback(async()=>{
    setRows([]);setLoaded(false);if(!token){setError('所有者接続後に台帳を表示します。');return;}
    try{const r=await fetch('/api/private-background',{headers:authHeaders(),cache:'no-store'});
      if(!r.ok)throw new Error();const d=await r.json();if(!Array.isArray(d.items))throw new Error();
      setRows(d.items);setLoaded(true);setError(d.truncated?'上限に達しました。Notionで残りを確認してください。':'');
    }catch{setError('台帳を取得できません。Notionの正本を確認してください。');}
  },[token]);
  useEffect(()=>{void load();const id=window.setInterval(()=>void load(),120000);return()=>window.clearInterval(id);},[load]);
  const value=(n:number|null)=>n===null?'未取得':`${n.toLocaleString('ja-JP')}%`;
  const date=(d:string|null)=>d&&Number.isFinite(Date.parse(d))?fmtJst(d):'未取得';
  return <section className="panel background-ledger" aria-label="バックグラウンド処理台帳">
    <div className="panel-heading"><div><span className="section-kicker">BACKGROUND / NOTION</span><h2>バックグラウンド処理台帳</h2></div><a href={DB} target="_blank" rel="noreferrer">Notion正本 ↗</a></div>
    <p>1処理1行。週次枠％はAIごとの枠に対する推定値です。配分％とは分けて表示します。未取得を0に換算しません。</p>
    <div className="background-controls"><label>処理・担当AIを検索 <input value={filter} onChange={e=>setFilter(e.target.value)}/></label><button onClick={()=>void load()}>再取得</button></div>
    {error&&<p role="alert">{error}</p>}{loaded&&<p>{rows.length}処理登録 · 要確認 {rows.filter(r=>['未確認','予定超過','要確認'].includes(health(r))).length}件</p>}
    <div className="background-grid">{rows.filter(r=>(r.title+' '+r.executor).toLowerCase().includes(filter.toLowerCase())).map(r=><article key={r.id}>
      <div className="background-heading"><h3><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></h3><span>{r.status}</span></div>
      <p>{r.executor} · {r.schedule||'頻度未取得'}</p>
      <dl><dt>週次枠の消費</dt><dd>{value(r.weeklyPercent)} <small>{r.quality}</small></dd><dt>記録内の配分</dt><dd>{value(r.sharePercent)}</dd><dt>週トークン</dt><dd>{r.tokens===null?'未取得':r.tokens.toLocaleString('ja-JP')}</dd><dt>対象週の開始</dt><dd>{date(r.weekStart)}</dd><dt>補正日時</dt><dd>{date(r.calibratedAt)}</dd><dt>最終実行</dt><dd>{date(r.lastRun)}</dd><dt>次回実行</dt><dd>{date(r.nextRun)}</dd><dt>稼働確認</dt><dd>{health(r)}</dd><dt>成果</dt><dd>{r.result||'未取得'}</dd></dl>
    </article>)}</div>
  </section>;
}
