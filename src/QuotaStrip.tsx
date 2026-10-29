import { useEffect, useState } from 'react';
import type { Quota } from './QuotaRow';
type Catalog = { quotas?: Quota[] };
const SERVICES = [
  {name:'Claude',provider:'Claude Code CLI',kind:'7日枠'},
  {name:'Antigravity',provider:'Gemini / Antigravity CLI',kind:'モデル枠'},
  {name:'Codex',provider:'Codex CLI',kind:'7日枠'},
  {name:'Muse',provider:'Muse',kind:'利用枠'},
] as const;
const percent = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const left = (spent: unknown, balance: unknown = null): number | null =>
  percent(balance) ?? (percent(spent) === null ? null : 100 - (spent as number));
const show = (v: number | null) => v === null ? '—%' : Math.round(v) + '%';
export function quotaTone(value: number | null): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (value === null) return 'unknown';
  return value < 30 ? 'critical' : value < 50 ? 'warning' : 'healthy';
}
const timeZone = 'Asia/Tokyo';
const day = new Intl.DateTimeFormat('ja-JP',{timeZone,month:'numeric',day:'numeric',weekday:'short'});
const clock = new Intl.DateTimeFormat('ja-JP',{timeZone,hour:'2-digit',minute:'2-digit',hour12:false});
const short = (v: number) => new Date(v).toLocaleString('ja-JP',{timeZone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
export function untilReset(when: string | null | undefined, now: number): string {
  if (!when) return '更新日不明';
  const reset = Date.parse(when);
  if (!Number.isFinite(reset)) return '更新日不明';
  const minutes = Math.ceil((reset - now)/60000);
  if (minutes <= 0) return '更新時刻確認中';
  if (minutes < 60) return 'あと' + minutes + '分';
  const days = Math.floor(minutes/1440), hours = Math.ceil((minutes-days*1440)/60);
  return days ? 'あと'+days+'日'+(hours ? hours+'時間':'') : 'あと'+hours+'時間';
}
export default function QuotaStrip() {
  const [data,setData] = useState<Catalog|null>(null);
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        const response=await fetch('/data/operations-catalog.json?t='+Date.now(),{cache:'no-store'});
        if(!response.ok) throw new Error('unavailable');
        const result:Catalog=await response.json();
        if(active)setData(Array.isArray(result.quotas)?result:null);
      }catch{if(active)setData(null);}
    };
    void load();
    const refresh=window.setInterval(()=>void load(),120000);
    const tick=window.setInterval(()=>{if(active)setNow(Date.now());},15000);
    return()=>{active=false;window.clearInterval(refresh);window.clearInterval(tick)};
  },[]);
  const entries=SERVICES.map(({name,provider,kind})=>{
    const q=data?.quotas?.find(x=>x.provider===provider);
    const observed=q?.observedAt?Date.parse(q.observedAt):NaN;
    const age=Number.isFinite(observed)?now-observed:Infinity;
    const recent=age>=-300000&&age<=86400000&&q?.quality!=='unavailable';
    const seven=recent?left(q?.weeklyUsedPercent):null;
    const five=recent?left(q?.usedPercent,q?.remainingPercent):null;
    const isModel=name==='Antigravity', isMuse=name==='Muse';
    // Never present model-specific limits as a weekly balance.
    const value=isModel||isMuse?five:(seven ?? five);
    const label=isModel?'モデル残量':seven!==null?'7日残量':five!==null?'5時間残量':'残量';
    const reset=isModel||isMuse?q?.resetAt:seven!==null?q?.weeklyResetAt:q?.resetAt;
    const resetLabel=recent&&reset&&Date.parse(reset)>now?untilReset(reset,now):'更新日不明';
    const state=value===null?'未取得':age>1800000||q?.quality==='stale'?'前回値':q?.quality==='estimated'?'推定':'実測';
    // Stale data is shown clearly as historical, not live; ancient records remain unknown.
    return {name,observed,recent,seven,five,value,label,state,resetLabel,resetKind:kind,tone:quotaTone(value),evidence:q?.evidence||'',quality:q?.quality||'unavailable'};
  });
  return <section className="quota-strip" aria-label="AI別 7日間利用枠の残量" role="group">
    <time className="quota-clock" dateTime={new Date(now).toISOString()} aria-label="今日の日付と日本時間"><span>{day.format(now)}</span><strong>{clock.format(now)}</strong></time>
    <span className="quota-strip-label">残量</span>
    {entries.map(e=><div className={'quota-week-chip quota-balance-'+e.tone} key={e.name}
        aria-label={e.name+' '+e.label+' '+(e.value===null?'未取得':show(e.value))}
        title={e.name+'：'+e.label+' '+show(e.value)+' / '+e.state}>
      <span className="quota-week-name">{e.name} <small>{e.label}</small></span>
      <strong className="quota-week-amount">{show(e.value)}</strong>
      <div className="quota-balance-track" role="img" aria-label={e.name+' 残りゲージ '+(e.value===null?'不明':show(e.value))}>
        <span style={{width:(e.value ?? 0)+'%'}} />
      </div>
      <span className="quota-week-state">{e.state}</span>
      <span className="quota-reset-label" title={e.resetKind+'リセットまで'}>{e.resetLabel}</span>
    </div>)}
    <details className="quota-details"><summary aria-label="5時間枠と観測日時の詳細を開く">詳細 <span aria-hidden="true">⌄</span></summary>
      <div className="quota-details-content"><div className="quota-details-title">取得した残量の根拠</div>
        {entries.map(e=><div key={e.name} className="quota-detail-row">
          <strong>{e.name}</strong>
          <span>{e.name==='Antigravity'?'モデル別':'5時間'} {show(e.five)}</span><span>7日 {show(e.seven)}</span>
          <small>{e.recent&&Number.isFinite(e.observed)?short(e.observed):Number.isFinite(e.observed)?'旧記録 '+short(e.observed):'未取得'}</small>
          <small>{e.resetKind}：{e.resetLabel}</small>
          <small>{e.evidence || '取得元なし'} · {e.state}</small>
        </div>)}
        <p>緑 50％以上、黄 30〜49％、赤 30％未満。数値は提供元の残り利用枠であり、残りトークン数とは限りません。古い記録と未取得は区別して表示します。Antigravityはモデル別の枠で、7日枠へ換算しません。</p>
      </div>
    </details>
  </section>;
}
