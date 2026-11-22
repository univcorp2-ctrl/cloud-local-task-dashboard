export const BACKGROUND_SOURCE='41d10562-e58b-811c-8347-000b90f1531a';
type Prop={title?:Array<{plain_text?:string}>;rich_text?:Array<{plain_text?:string}>;select?:{name:string}|null;number?:number|null;date?:{start:string}|null};
type Page={id:string;url:string;properties:Record<string,Prop>};
export function toBackground(p:Page){
  const text=(k:string)=>(p.properties[k]?.title??p.properties[k]?.rich_text??[]).map(x=>x.plain_text??'').join('');
  const num=(k:string)=>{const n=p.properties[k]?.number;return typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;};
  return {id:p.id,url:p.url,title:text('処理名'),executor:p.properties['実行者']?.select?.name??'未取得',
    status:p.properties['状態']?.select?.name??'要確認',schedule:text('スケジュール'),
    lastRun:p.properties['最終実行']?.date?.start??null,nextRun:p.properties['次回実行']?.date?.start??null,
    checkedAt:p.properties['最終確認']?.date?.start??null,result:text('成果'),evidence:text('稼働確認'),
    tokens:num('週トークン'),weeklyPercent:num('週の枠に対する推定%'),sharePercent:num('推定トークン配分%'),
    quality:text('計測品質')||'未取得',weekStart:p.properties['週開始']?.date?.start??null,
    calibratedAt:p.properties['補正日時']?.date?.start??null};
}
export type BackgroundRow=ReturnType<typeof toBackground>;
export function health(r:BackgroundRow,now=Date.now()){
  if(r.status==='停止'||r.status==='保留')return r.status;
  if(r.nextRun&&Number.isFinite(Date.parse(r.nextRun))&&Date.parse(r.nextRun)+3600000<now)return '予定超過';
  if(!r.checkedAt||!Number.isFinite(Date.parse(r.checkedAt))||now-Date.parse(r.checkedAt)>86400000)return '未確認';
  if(r.status==='要確認')return '要確認';
  return r.evidence||'未確認';
}
