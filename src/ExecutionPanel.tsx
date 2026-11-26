import { fmtJst } from './controlState';
import './execution.css';

type Run = {run_id:string;ai:string;task:string;finished_at:string;status:string;item_count:number;evidence_url:string};
type Reply = {account:string;message_id:string;thread_id:string;received_at:string;owner_ai:string;status:string;evidence_url:string};
type Source = {account:string;checked_at:string;status:string;window_start:string;message_count:number;error_code?:string};
export type ExecutionData = {generatedAt:string;agents:{ai:string;lamp:'red'|'yellow'|'green';lastAt:string|null;status:string|null}[];runs:Run[];pending:Reply[];pendingTotal:number;pendingTruncated:boolean;sources:Source[]};
const requiredAccounts=['bukken511','hero.ota','univcorp1','univcorp2','airly.corp'];
const sourceFresh=(s:Source)=>{const age=Date.now()-Date.parse(s.checked_at);return s.status==='ok'&&Number.isFinite(age)&&age>=0&&age<24*3600000};
const safeLink=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?value:undefined}catch{return undefined}};

export default function ExecutionPanel({data,status}:{data:ExecutionData|null;status:number|'error'|null}) {
  const missing=requiredAccounts.filter(a=>!data?.sources.some(s=>(s.account===a||s.account===a+'@gmail.com')&&sourceFresh(s)));
  return <section className="panel execution-panel" aria-label="共通実行ログと未対応返信">
    <div className="panel-heading"><div><span className="section-kicker">EXECUTION</span><h2>AI実行ログ・未対応返信</h2></div></div>
    {!data?<p role="status">{status===401||status===403?'接続後に実行ログと返信を表示します。':status===null?'実行ログを取得中…':'実行ログ・返信受信台帳を取得できません。収集状況を確認してください。'}</p>:<>
      <p>1作業1行の共通ログ。24時間以上無記録・失敗・停止・不確定は赤。</p>
      <div className="execution-lamps">{data.agents.map(a=><div key={a.ai} className={'execution-lamp '+a.lamp}><strong>{a.lamp==='red'?'🔴':a.lamp==='yellow'?'🟡':'🟢'} {a.ai}</strong><small>{a.lastAt?fmtJst(a.lastAt):'実行記録なし'} · {a.status??'未報告'}</small></div>)}</div>
      <h3>相手からの返信で未対応 {data.pendingTotal}件</h3>
      <p>LINE・Messengerの直接収集は未接続。表示件数は受信台帳の登録分です。</p>
      {missing.length>0&&<p className="execution-warning" role="status">収集未確認・失敗・24時間以上経過：{missing.join(' / ')}。全件確認済みではありません。</p>}
      {data.sources.filter(s=>!sourceFresh(s)).map(s=><p key={s.account}>{s.account}: {s.status} · 最終確認 {fmtJst(s.checked_at)}</p>)}
      {data.pendingTruncated&&<p>先頭200件を表示（全{data.pendingTotal}件）。</p>}
      <ul>{data.pending.map(r=><li key={r.account+':'+r.message_id}><a href={safeLink(r.evidence_url)} target="_blank" rel="noreferrer">返信を確認</a> · {r.account} · {fmtJst(r.received_at)} · 担当 {r.owner_ai} · {r.status}</li>)}</ul>
      {!data.pending.length&&<p>台帳の未対応記録は0件。収集未確認の受信箱は含みません。</p>}
      <h3>直近の実行</h3>
      <div className="execution-table"><table><thead><tr><th>AI</th><th>日時</th><th>作業</th><th>件数</th><th>結果</th></tr></thead><tbody>{data.runs.map(r=><tr key={r.run_id}><td>{r.ai}</td><td>{fmtJst(r.finished_at)}</td><td><a href={safeLink(r.evidence_url)} target="_blank" rel="noreferrer">{r.task}</a></td><td>{r.item_count}</td><td>{r.status}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
