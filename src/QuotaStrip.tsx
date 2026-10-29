import { useEffect, useState } from 'react';
import type { Quota } from './QuotaRow';
type Catalog = { quotas?: Quota[] };
const SERVICES = [{name:'Codex',provider:'Codex CLI'}, {name:'Claude',provider:'Claude Code CLI'}, {name:'Antigravity',provider:'Gemini / Antigravity CLI'}, {name:'Muse',provider:'Muse'}] as const;
const percent = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : null;
const left = (spent: unknown, balance: unknown = null): number | null =>
  percent(balance) ?? (percent(spent) === null ? null : 100 - (spent as number));
const show = (v: number | null) => v === null ? '—%' : Math.round(v) + '%';
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
      try{const response=await fetch('/data/operations-catalog.json?t='+Date.now(),{cache:'no-store'});
        if(!response.ok)throw new Error('unavailable');
        const result:Catalog=await response.json();
        if(active)setData(Array.isArray(result.quotas)?result:null);
      }catch{if(active)setData(null);}
    };
    void load();const refresh=window.setInterval(()=>void load(),120000);
    const tick=window.setInterval(()=>{if(active)setNow(Date.now());},15000);
    return()=>{active=false;window.clearInterval(refresh);window.clearInterval(tick)};
  },[]);
  const entries=SERVICES.map(({name,provider})=>{
    const q=data?.quotas?.find(x=>x.provider===provider);
    const observed=q?.observedAt?Date.parse(q.observedAt):NaN;
    const age=Number.isFinite(observed)?now-observed:Infinity;
    const recent=age>=-300000&&age<=86400000&&q?.quality!=='unavailable';
    const seven=name==='Antigravity'||name==='Muse'?null:recent?left(q?.weeklyUsedPercent):null;
    const five=recent?left(q?.usedPercent,q?.remainingPercent):null;
    // Model pool availability is not a weekly quota. Muse has no verified adapter yet.
    const remaining=name==='Antigravity'?five:name==='Muse'?null:seven;
    const reset=name==='Antigravity'?q?.resetAt:q?.weeklyResetAt;
    const resetLabel=recent&&reset&&Date.parse(reset)>now?untilReset(reset,now):'更新日不明';
    const state=remaining!==null?(age<=1800000&&q?.quality!=='stale'?(q?.quality==='estimated'?'推定':'実測'):'前回値'):'未取得';
    return {name,observed,recent,seven,five,remaining,resetLabel,state,resetKind:name==='Antigravity'?'モデル枠':name==='Muse'?'未連携':'7日枠',label:name==='Antigravity'?'モデル枠':name==='Muse'?'取得待ち':'7日枠'};
  });
  return <section className="quota-strip" aria-label="AI別 利用可能な残量" role="group">
    <time className="quota-clock" dateTime={new Date(now).toISOString()} aria-label="今日の日付と日本時間"><span>{day.format(now)}</span><strong>{clock.format(now)}</strong></time>
    <span className="quota-strip-label">AI残量</span>
    {entries.map(e=><div className={'quota-week-chip quota-band-'+(e.remaining===null?'unknown':e.remaining>=50?'good':e.remaining>=20?'caution':'low')} key={e.name} aria-label={e.name+' '+e.label+'の残量 '+(e.remaining===null?'未取得':show(e.remaining))}>
      <span className="quota-week-name">{e.name}<small>{e.label}</small></span><strong className="quota-week-amount">{show(e.remaining)}</strong>
      <span className="quota-week-state">{e.state}</span><span className="quota-reset-label" title={e.resetKind+'リセットまで'}>{e.resetLabel}</span>
      <span className="quota-week-gauge" role="img" aria-label={e.remaining===null?'未測定':show(e.remaining)+'残り'}><span style={{width:(e.remaining??0)+'%'}} /></span>
    </div>)}
    <details className="quota-details"><summary aria-label="5時間枠と観測日時の詳細を開く">詳細 <span aria-hidden="true">⌄</span></summary>
      <div className="quota-details-content"><div className="quota-details-title">利用枠の詳細</div>
        {entries.map(e=><div key={e.name} className="quota-detail-row"><strong>{e.name}</strong>
          <span>{e.name==='Antigravity'?'モデル別':'5時間'} {show(e.five)}</span><span>{e.name==='Antigravity'?'7日対象外':'7日 '+show(e.seven)}</span>
          <small>{e.recent&&Number.isFinite(e.observed)?short(e.observed):Number.isFinite(e.observed)?'旧記録 '+short(e.observed):'未取得'}</small>
          <small>{e.resetKind}：{e.resetLabel}</small></div>)}
        <p>日時は日本時間。リセット残り時間は提供元から取得したリセット時刻に基づきます。Antigravityはモデル別枠を表示し、7日枠に換算しません。Museを含め根拠のない数値は未取得と表示します。</p></div>
    </details>
  </section>;
}
