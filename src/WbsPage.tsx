import { useEffect, useState } from 'react';
import { authHeaders, useOwnerToken } from './controlState';
import type { WbsData, WbsTask } from '../functions/_lib/wbs';
import './wbs.css';

const day = (value: string) => value.length === 10 ? value : new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo'}).format(new Date(value));
function TaskLink({ task }: { task: WbsTask }) {
  const url = /^https:\/\/(?:www\.)?notion\.so\//.test(task.url) || /^https:\/\/app\.notion\.com\//.test(task.url) ? task.url : undefined;
  return <a className={`wbs-task ${task.blockedReasons.length ? 'wbs-blocked' : ''}`} href={url} target="_blank" rel="noreferrer">
    <strong>{task.blockedReasons.length ? '⏸' : '◷'} {task.title || '無題'}</strong>
    <span>{task.assignedAi && !/未割当/.test(task.assignedAi) ? task.assignedAi : task.owner || '未割当'} · {task.due ? day(task.due) : '期限未設定'}{task.duration ? ` · ${task.duration}` : ''}</span>
    <span>{task.status} {task.executionStatus}</span>
    {task.blockedReasons.length > 0 && <span className="wbs-danger">{task.blockedReasons.join('／')}</span>}
    <span className="wbs-next" title={task.nextAction}>次の一手：{task.nextAction || '未設定'}</span>
  </a>;
}

export default function WbsPage({ onConnect }: { onConnect: () => void }) {
  const [token] = useOwnerToken();
  const [data, setData] = useState<WbsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    let alive = true, pending = false;
    setData(null);
    async function load(force = false) {
      if (pending) return;
      pending = true; if (alive) setBusy(true);
      try {
        const response = await fetch('/api/private-wbs' + (force ? '?refresh=1' : ''), { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '本人接続が必要です。接続設定を開いてください。' : response.status === 503 ? '認証またはNotion連携が未設定です。' : 'Notionの取得に失敗しました。');
        const next = await response.json() as WbsData;
        if (next.source !== 'Notion' || !Array.isArray(next.pillars)) throw new Error('WBS応答を確認できません。');
        if (alive) { setData(next); setError(''); }
      } catch (e) { if (alive) { setData(null); setError(e instanceof Error ? e.message : '取得に失敗しました。'); } }
      finally { pending = false; if (alive) setBusy(false); }
    }
    void load(refreshVersion > 0);
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void load(); }, 60_000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    const focus = () => void load();
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', focus);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', focus); };
  }, [token, refreshVersion]);
  return <section className="wbs-page" aria-label="WBS・マスタースケジュール">
    <div className="wbs-toolbar"><p>Notion正本 · 60秒ごとに確認{data && <> · 最終取得 <time>{new Date(data.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</time></>}</p>
      <button className="refresh-button" disabled={busy} onClick={() => setRefreshVersion(v => v + 1)}>{busy ? '読み込み中…' : 'Notionから今すぐ更新'}</button></div>
    {error && <div role="alert"><p>{error}</p><button onClick={onConnect}>接続設定を開く</button></div>}
    {!data && !error && <p role="status">Notionから読み込み中…</p>}
    {data && <>
      {data.truncated && <p role="alert">取得上限に達しています。一部のタスクが含まれていません。</p>}
      <section><h2>今日Hiroがやること</h2><p>担当Hiroの未完了タスク · 期限順で最大5件</p>{data.hiro.length ? data.hiro.map(task => <TaskLink key={task.id} task={task} />) : <p>該当する未完了タスクはありません。</p>}</section>
      <div className="wbs-pillars">{data.pillars.map(pillar => <details key={pillar.id} open className="wbs-pillar"><summary><strong>柱{pillar.id}｜{pillar.title}</strong><span>進行中 {pillar.active} ／ <b className={pillar.blocked ? 'wbs-danger' : ''}>止まり {pillar.blocked}</b> ／ 今週期限 {pillar.dueThisWeek}</span></summary>
        {pillar.groups.length ? pillar.groups.map(group => <section key={group.title}><h3>{group.title}</h3>{group.tasks.map(task => <TaskLink key={task.id} task={task} />)}</section>) : <p>未完了タスクはありません。</p>}
      </details>)}</div>
      {data.unclassified.length > 0 && <details className="wbs-pillar" open><summary>柱未分類 {data.unclassified.length}件</summary><p>NotionのWBSサマリーに柱タグを付けてください。</p>{data.unclassified.map(task => <TaskLink key={task.id} task={task} />)}</details>}
      <section className="wbs-schedule"><h2>マスタースケジュール · 4週間</h2><p>期限の位置を表示 · 赤線＝今日 · 網掛け＝土曜（送信しない日）</p>
        {[0, 1, 2, 3].map(week => { const days = data.schedule.days.slice(week * 7, week * 7 + 7); const tasks = data.schedule.tasks.filter(t => t.due && days.some(d => d.date === day(t.due!))); return <section className="wbs-week" key={week}><h3>第{week + 1}週</h3>
          <div className="wbs-days">{days.map((d,i) => <span key={d.date} className={(d.saturday ? 'wbs-saturday ' : '') + (week === 0 && i === 0 ? 'wbs-today' : '')}>{d.date.slice(5)}</span>)}</div>
          {tasks.map(task => <div key={task.id} className="wbs-schedule-row"><TaskLink task={task}/><div className="wbs-bars" aria-label={`期限 ${day(task.due!)}`}>{days.map((d,i) => <span key={d.date} className={(d.saturday ? 'wbs-saturday ' : '') + (week === 0 && i === 0 ? 'wbs-today' : '')}>{day(task.due!) === d.date && <i className={task.blockedReasons.length ? 'wbs-bar blocked' : 'wbs-bar'} />}</span>)}</div></div>)}
          {!tasks.length && <p>期限のあるタスクはありません。</p>}
        </section>; })}
      </section>
      <section><h2>振り返り待ち · Notionの未完了タスク</h2><p>カレンダーとの照合は未接続です。Notionに明記された振り返りタスクのみ表示します。</p>{data.reviews.map(task => <TaskLink key={task.id} task={task}/>)}{!data.reviews.length && <p>登録された未完了の振り返りタスクはありません。</p>}</section>
      <p>保留 {data.heldCount}件（明細はNotionで確認）</p>
    </>}
  </section>;
}
