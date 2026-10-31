import { useMemo, useState } from 'react';
import { fmtJst, type ControlSnapshot, type JobItem, type UsageItem } from './controlState';

const STATUS: Record<JobItem['status'], [string, string]> = {
  running: ['実行中', 'run'], success: ['成功', 'ok'], failed: ['失敗', 'ng'], paused: ['停止中', 'pause'], scheduled: ['待機', 'wait'], ended: ['終了', 'end'],
};
const PLATFORM: Record<string, string> = {
  claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', muse: 'Muse', windows: 'Windows PC', github: 'GitHub', cloudflare: 'Cloudflare', other: 'その他',
};
const ago = (iso: string | null) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m}分前` : m < 1440 ? `${Math.round(m / 60)}時間前` : `${Math.round(m / 1440)}日前`;
};
const dur = (s: number | null) => s === null ? '' : s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ''}`;
const norm = (v: string) => v.replace(/\s+/g, '').slice(0, 40);

export type JobRow = JobItem & { source: string; sourceLabel: string; quotaPt: number | null; sharePct: number | null };

export function useJobRows(data: ControlSnapshot | null): JobRow[] {
  return useMemo(() => {
    const usage = new Map<string, UsageItem>();
    for (const u of data?.usage ?? []) for (const it of u.items) if (it.kind === 'scheduled') usage.set(`${u.provider}:${norm(it.label)}`, it);
    return (data?.jobs ?? []).flatMap((r) => r.items.map((j) => {
      const hit = usage.get(`${j.platform}:${norm(j.name)}`);
      return { ...j, source: r.source, sourceLabel: r.label, quotaPt: hit?.quotaPercent ?? null, sharePct: hit?.sharePercent ?? null };
    }));
  }, [data]);
}

const order = (j: JobRow) => (j.status === 'running' ? 0 : j.status === 'failed' ? 1 : j.enabled ? 2 : 3);

export default function JobsPanel({ data, connected, onConnect, compact = false }: { data: ControlSnapshot | null; connected: boolean; onConnect: () => void; compact?: boolean }) {
  const rows = useJobRows(data);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [platform, setPlatform] = useState('all');
  const active = rows.filter((j) => j.enabled || j.status === 'running');
  const running = rows.filter((j) => j.status === 'running');
  const failed = active.filter((j) => j.status === 'failed');
  const next = [...active].filter((j) => j.nextRunAt && Date.parse(j.nextRunAt) > Date.now()).sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!));
  const platforms = [...new Set(rows.map((j) => j.platform))];
  const shown = rows.filter((j) => (filter === 'all' || j.enabled || j.status === 'running') && (platform === 'all' || j.platform === platform))
    .sort((a, b) => order(a) - order(b) || (b.quotaPt ?? -1) - (a.quotaPt ?? -1) || (Date.parse(a.nextRunAt ?? '') || 9e15) - (Date.parse(b.nextRunAt ?? '') || 9e15));
  const list = compact ? shown.filter((j) => j.status === 'running' || j.status === 'failed' || (j.quotaPt ?? 0) >= 1).slice(0, 8) : shown;

  return (
    <section className="panel jobs-panel" aria-label="AIが動かしているタスク">
      <div className="panel-heading"><div><span className="section-kicker">LIVE JOBS</span><h2>AIが動かしているタスク（Claude・PC・Codex ほか）</h2></div>
        {!compact && <div className="jobs-filters">
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'active' | 'all')} aria-label="有効のみ"><option value="active">有効なものだけ</option><option value="all">停止・終了も表示</option></select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="実行環境"><option value="all">すべての実行環境</option>{platforms.map((p) => <option key={p} value={p}>{PLATFORM[p] ?? p}</option>)}</select>
        </div>}
        {compact && <a className="ov-more" href="#automation">全部見る →</a>}
      </div>
      {!connected && <div className="ov-empty"><p>タスク名・実行履歴は認証後に表示されます（現在 {data?.jobCounts?.total ?? 0} 件稼働・失敗 {data?.jobCounts?.failed ?? 0} 件）。</p><button type="button" onClick={onConnect}>接続する</button></div>}
      {connected && rows.length === 0 && <p className="ov-note">まだ報告がありません。Claude定期タスク一覧は3時間ごと、PCのタスクは30分ごとに自動送信されます。</p>}
      {connected && rows.length > 0 && <>
        <div className="jobs-tiles">
          <div className="t-run"><span>いま実行中</span><strong>{running.length}</strong><small>{running.slice(0, 2).map((j) => j.name.slice(0, 18)).join('・') || '—'}</small></div>
          <div><span>有効な定期・予約</span><strong>{active.length}</strong><small>{platforms.map((p) => `${PLATFORM[p] ?? p} ${active.filter((j) => j.platform === p).length}`).join(' · ')}</small></div>
          <div className={failed.length ? 't-ng' : ''}><span>直近が失敗</span><strong>{failed.length}</strong><small>{failed.slice(0, 2).map((j) => j.name.slice(0, 18)).join('・') || 'なし'}</small></div>
          <div><span>次に動く</span><strong className="small">{next[0] ? fmtJst(next[0].nextRunAt, true) : '—'}</strong><small>{next[0]?.name.slice(0, 26) ?? ''}</small></div>
        </div>
        <div className="jobs-list">
          {list.map((j) => <article key={`${j.source}:${j.id}`} className={`job s-${STATUS[j.status][1]}${j.enabled ? '' : ' off'}`}>
            <div className="job-main">
              <span className={`job-pill s-${STATUS[j.status][1]}`}>{STATUS[j.status][0]}</span>
              <span className="job-plat">{PLATFORM[j.platform] ?? j.platform}</span>
              <strong title={j.name}>{j.link ? <a href={j.link} target="_blank" rel="noopener noreferrer">{j.name}</a> : j.name}</strong>
            </div>
            <div className="job-meta">
              <span>⏱ {j.scheduleLabel || j.schedule || '—'}{j.oneShot ? '（1回）' : ''}</span>
              <span>前回 {j.lastRunAt ? `${fmtJst(j.lastRunAt, true)}（${ago(j.lastRunAt)}${j.durationSeconds !== null ? `・${dur(j.durationSeconds)}` : ''}）` : '—'}</span>
              <span>次回 {j.enabled && j.nextRunAt ? fmtJst(j.nextRunAt, true) : '—'}</span>
              {j.model && <span>{j.model}</span>}
              {j.runsPerWeek !== null && <span>週{j.runsPerWeek}回</span>}
            </div>
            {(j.quotaPt !== null || j.sharePct !== null) && <div className="job-cost" title="Claude週枠のうちこのタスクが使った割合（実行回数×実行時間で按分した推定）">
              <div className="ov-bar"><span style={{ width: `${Math.min(100, (j.quotaPt ?? 0) * 2)}%` }} /></div>
              <em>週枠 {j.quotaPt ?? '—'}pt（{PLATFORM[j.platform]}全体の{j.sharePct ?? '—'}%・推定）</em>
            </div>}
            {j.note && <p className="job-note">{j.note}</p>}
          </article>)}
          {list.length === 0 && <p className="ov-note">表示できるタスクはありません。</p>}
        </div>
        {!compact && <p className="ov-note">{(data?.jobs ?? []).map((r) => `${r.label}: ${fmtJst(r.observedAt, true)}取得（${ago(r.observedAt)}）`).join('　/　')}</p>}
      </>}
    </section>
  );
}
