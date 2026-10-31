import { useCallback, useEffect, useMemo, useState } from 'react';
import QuotaGauges from './QuotaGauges';
import DashboardDirectory from './DashboardDirectory';
import EarnLabPanel, { type EarnLab } from './EarnLabPanel';
import SnsPanel, { type EstateParts } from './SnsPanel';
import UsagePanel from './UsagePanel';
import { authHeaders, fmtJst, useConnected, useControlState, useOwnerToken, type ControlSnapshot, type Kpi } from './controlState';
import type { ScheduledTask, TaskSnapshot } from './types';
import './overview.css';

type PrivateTask = { id: string; url: string; title: string; category: string; priority: string; status: string; owner: string;
  executor: string; assignedAi?: string; autonomy?: string; due: string | null; nextAction: string; humanAction: string; whyHuman?: string;
  executionStatus: string; cashDistance?: string; order?: number | null; completed: boolean };
type ActiveProject = { id: string; title: string; priority: string; progressPercent: number; executionStatus: string; nextAction: string; inspectedAt: string; phase: string; links?: Array<{ label: string; url: string }> };
type DevCatalog = { averageProgress: number; activeProjectsUpdatedAt?: string; activeProjects?: ActiveProject[]; coverage?: { allRepositories: number } };
type External = { ok: boolean; fetchedAt: string; parts: Record<string, { ok: boolean; data?: unknown; error?: string }> };

const NOTION = 'https://www.notion.so/5f61a18de1f84eac84ac355126311f8b';
const rank = (s: string) => s.includes('最高') ? 0 : s.includes('高') ? 1 : s.includes('中') ? 2 : 3;
const isHuman = (t: PrivateTask) => t.owner.includes('人間') || t.owner.includes('両方') || t.executor === 'Hiro' || Boolean(t.humanAction) || t.autonomy === 'Hiro必須';
const isAI = (t: PrivateTask) => !isHuman(t) && (t.owner.includes('AI') || t.autonomy === '自律実行OK' || ['CLIエージェント', 'ChatGPT追撃', '自動調査'].includes(t.executor));
const dueText = (d: string | null) => d ? `期限 ${d.slice(5, 10).replace('-', '/')}` : '期限なし';
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const yen = (v: number | null) => v === null ? '—' : v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : `${v.toLocaleString('ja-JP')}円`;
const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);

function useJson<T>(url: string, intervalMs: number, withAuth = false) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<number | 'error' | null>(null);
  const [token] = useOwnerToken();
  const load = useCallback(async () => {
    try {
      const response = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', headers: withAuth ? authHeaders() : {} });
      setStatus(response.status);
      if (!response.ok) { setData(null); return; }
      setData(await response.json() as T);
    } catch { setStatus('error'); setData(null); }
  }, [url, withAuth]);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), intervalMs); return () => window.clearInterval(id); }, [load, intervalMs, token]);
  return { data, status, reload: load };
}

function KpiCard({ label, value, sub, tone, link, bar }: { label: string; value: string; sub?: string; tone?: string; link?: string | null; bar?: number | null }) {
  const body = <>
    <span className="ov-kpi-label">{label}</span>
    <strong className="ov-kpi-value">{value}</strong>
    {bar !== undefined && bar !== null && <div className="ov-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></div>}
    {sub && <small>{sub}</small>}
  </>;
  const cls = `ov-kpi ${tone ?? ''}`;
  return link ? <a className={cls} href={link} target="_blank" rel="noopener noreferrer">{body}<i aria-hidden="true">↗</i></a> : <div className={cls}>{body}</div>;
}

function kpiProgress(k: Kpi): { pct: number | null; text: string } {
  if (k.target === null || k.actual === null || k.target === 0) return { pct: null, text: k.actual === null ? '実測なし' : `${k.actual.toLocaleString('ja-JP')}${k.unit}` };
  const pct = k.direction === 'down' ? (k.actual <= k.target ? 100 : Math.max(0, 100 - ((k.actual - k.target) / k.target) * 100)) : (k.actual / k.target) * 100;
  const fmt = (v: number) => k.unit === 'JPY' ? yen(v) : `${v.toLocaleString('ja-JP')}${k.unit}`;
  return { pct, text: `${fmt(k.actual)} / 目標 ${fmt(k.target)}（${Math.round(pct)}%）` };
}

export default function OverviewPage({ onConnect }: { onConnect: () => void }) {
  const { data: state, error: stateError } = useControlState(60_000);
  const token = useConnected();
  const tasks = useJson<TaskSnapshot>('/data/tasks.json', 120_000);
  const dev = useJson<DevCatalog>('/data/development-progress.json', 180_000);
  const estate = useJson<External>('/api/external/estateboard', 300_000);
  const revenue = useJson<External>('/api/external/revenue-agent', 300_000);
  const priv = useJson<{ tasks?: PrivateTask[] }>(token ? '/api/private-tasks' : '/api/health', 180_000, true);
  const earn = useJson<EarnLab>(token ? '/api/private-earnlab' : '/api/health', 300_000, true);
  const earnLab = token && earn.data && typeof earn.data.total === 'number' ? earn.data : null;
  const EARN_TARGET = 5_000_000;
  const privateTasks = token && priv.data && Array.isArray(priv.data.tasks) ? priv.data.tasks : null;

  const human = useMemo(() => (privateTasks ?? []).filter((t) => !t.completed && isHuman(t))
    .sort((a, b) => (a.order ?? 9e9) - (b.order ?? 9e9) || rank(a.priority) - rank(b.priority) || (a.due || '9999').localeCompare(b.due || '9999')), [privateTasks]);
  const aiTasks = useMemo(() => (privateTasks ?? []).filter((t) => !t.completed && isAI(t)), [privateTasks]);
  const aiRunning = useMemo(() => aiTasks.filter((t) => t.executionStatus === '実行中'), [aiTasks]);
  const scheduled = tasks.data?.tasks ?? [];
  const running = scheduled.filter((t) => t.status === 'running');
  const failed = scheduled.filter((t) => t.status === 'failed');
  const recent = useMemo(() => [...scheduled].filter((t) => t.lastRun).sort((a, b) => +new Date(b.lastRun!) - +new Date(a.lastRun!)).slice(0, 5), [scheduled]);
  const projects = useMemo(() => [...(dev.data?.activeProjects ?? [])].sort((a, b) => a.priority.localeCompare(b.priority) || a.progressPercent - b.progressPercent).slice(0, 6), [dev.data]);

  const exp = estate.data?.parts?.experiments?.data as { summary?: Record<string, unknown> } | undefined;
  const social = estate.data?.parts?.social?.data as { summary?: Record<string, unknown> } | undefined;
  const daiwa = estate.data?.parts?.daiwa?.data as { counts?: Record<string, unknown> } | undefined;
  const rev = revenue.data?.parts?.status?.data as Record<string, unknown> | undefined;
  const earnKpi = state?.kpis.find((k) => k.id === 'earn-lab-monthly-revenue') ?? null;
  const otherKpis = (state?.kpis ?? []).filter((k) => k.id !== 'earn-lab-monthly-revenue');
  const today = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short' }).format(Date.now());
  const lowQuota = (state?.quotas ?? []).filter((q) => q.primary && q.primary.remainingPercent !== null && q.freshness !== 'missing' && q.primary.remainingPercent < 30).map((q) => q.label);

  return (
    <div className="overview">
      <section className="ov-focus panel" aria-label="今日の焦点">
        <div className="ov-focus-head">
          <div><p className="eyebrow">TODAY · {today}</p>
            <h2>{human.length ? `本人対応 ${human.length}件 · 最優先「${human[0].title}」` : token ? '本人対応タスクは未取得または0件' : 'Notionタスクを表示するには接続してください'}</h2></div>
          <div className="ov-focus-stats">
            <span><strong>{aiRunning.length || running.length}</strong>AI実行中</span>
            <span className={failed.length ? 'bad' : ''}><strong>{failed.length}</strong>失敗</span>
            <span><strong>{dev.data ? `${Math.round(dev.data.averageProgress)}%` : '—'}</strong>開発平均</span>
            {lowQuota.length > 0 && <span className="bad"><strong>!</strong>{lowQuota.join('・')} 残量30%未満</span>}
          </div>
        </div>
        {stateError && <p className="ov-note warn">状態API: {stateError}</p>}
      </section>

      <QuotaGauges quotas={state?.quotas ?? null} onConnect={onConnect} />

      <section className="ov-grid3">
        <article className="panel ov-col">
          <div className="panel-heading"><div><span className="section-kicker">HUMAN</span><h2>本人がやること</h2></div><a className="ov-more" href="#my-tasks">全タスク →</a></div>
          {!token && <div className="ov-empty"><p>Notionの本人タスクは認証後に表示されます。</p><button type="button" onClick={onConnect}>接続する</button><a href={NOTION} target="_blank" rel="noopener noreferrer">Notionで開く ↗</a></div>}
          {token && priv.status && priv.status !== 200 && <p className="ov-note warn">Notionタスクを取得できません（HTTP {priv.status}）。</p>}
          {token && human.length === 0 && priv.status === 200 && <p className="ov-note">本人対応の未完了タスクはありません。</p>}
          <ol className="ov-tasks">
            {human.slice(0, 7).map((t) => (
              <li key={t.id}>
                <a href={t.url} target="_blank" rel="noopener noreferrer"><strong>{t.title}</strong></a>
                <small>{t.priority} · {dueText(t.due)}{t.whyHuman ? ` · ${t.whyHuman}` : ''}</small>
                {(t.humanAction || t.nextAction) && <p>{t.humanAction || t.nextAction}</p>}
              </li>
            ))}
          </ol>
        </article>

        <article className="panel ov-col">
          <div className="panel-heading"><div><span className="section-kicker">AGENTS</span><h2>AIが動かしているもの</h2></div><a className="ov-more" href="#automation">自動化 →</a></div>
          <div className="ov-agents">
            {['claude', 'codex', 'antigravity', 'muse'].map((name) => {
              const a = state?.agents.find((x) => x.name === name);
              const ago = a ? Math.round((Date.now() - Date.parse(a.lastSeenAt)) / 60_000) : null;
              const live = a && ago !== null && ago <= 180 ? a.status : 'offline';
              return <div key={name} className={`ov-agent ${live}`}><span className="dot" /><strong>{name}</strong><small>{a ? (a.currentTask || a.status) + (ago !== null ? ` · ${ago < 60 ? ago + '分前' : Math.floor(ago / 60) + '時間前'}` : '') : '未報告'}</small></div>;
            })}
          </div>
          {token && aiTasks.length > 0 && <p className="ov-note">Notion上のAI担当タスク {aiTasks.length}件（実行中 {aiRunning.length}件）</p>}
          <ul className="ov-runs">
            {recent.map((t: ScheduledTask) => <li key={t.id}><span className={`status-pill ${t.status}`}>{t.status === 'success' ? '✓' : t.status === 'failed' ? '×' : '▶'}</span><div><strong>{t.name}</strong><small>{t.environment} · {fmtJst(t.lastRun)}</small></div></li>)}
            {!tasks.data && <li className="ov-note">定期タスクのスナップショットを読み込み中…</li>}
          </ul>
        </article>

        <article className="panel ov-col">
          <div className="panel-heading"><div><span className="section-kicker">BUILD</span><h2>開発・次アクション</h2></div><a className="ov-more" href="#development">開発進捗 →</a></div>
          <ul className="ov-projects">
            {projects.map((p) => <li key={p.id}>
              <div className="ov-proj-head"><strong>{p.title}</strong><span>{p.progressPercent}%</span></div>
              <div className="ov-bar"><span style={{ width: `${p.progressPercent}%` }} /></div>
              <small>{p.priority} · {p.executionStatus} · 次: {p.nextAction}</small>
            </li>)}
            {dev.data && projects.length === 0 && <li className="ov-note">進行中の開発案件はありません。</li>}
          </ul>
        </article>
      </section>

      <section className="panel ov-kpis" aria-label="KGI・KPI">
        <div className="panel-heading"><div><span className="section-kicker">KGI / KPI</span><h2>ゴールに対する進み方</h2></div><small>{estate.data ? `外部指標 ${fmtJst(estate.data.fetchedAt)} 取得` : ''}</small></div>
        <div className="ov-kpi-grid">
          {earnLab ? <KpiCard label={`Earn Lab 実入金 (${earnLab.month})`} value={yen(earnLab.cash.paidThisMonth)} sub={`目標 ${yen(EARN_TARGET)}（${((earnLab.cash.paidThisMonth / EARN_TARGET) * 100).toFixed(1)}%）· 累計 ${yen(earnLab.cash.paidTotal)}`} bar={(earnLab.cash.paidThisMonth / EARN_TARGET) * 100} tone={earnLab.cash.paidThisMonth / EARN_TARGET >= 0.5 ? 'good' : earnLab.cash.paidThisMonth / EARN_TARGET >= 0.2 ? 'mid' : 'low'} link="https://app.notion.com/p/40910562e58b811384a2ff02a4b4d4f1" />
            : earnKpi ? (() => { const p = kpiProgress(earnKpi); return <KpiCard label={earnKpi.label + (earnKpi.period ? ` (${earnKpi.period})` : '')} value={earnKpi.actual === null ? '実測なし' : yen(earnKpi.actual)} sub={p.text} bar={p.pct} tone={p.pct === null ? '' : p.pct >= 50 ? 'good' : p.pct >= 20 ? 'mid' : 'low'} link={earnKpi.link} />; })()
            : <KpiCard label="Earn Lab 月次売上" value={token ? '取得中' : '要接続'} sub={token ? 'Notion 実験DBから集計' : '認証後に表示'} tone="" />}
          <KpiCard label="Earn Lab 案件" value={rev ? `${num(get(rev, 'metrics.applications')) ?? '—'} 応募 / ${num(get(rev, 'metrics.contracts')) ?? '—'} 受注` : '—'}
            sub={rev ? `検証済み売上 ${yen(num(get(rev, 'metrics.revenue_jpy_verified')))} · ${fmtJst(String(get(rev, 'last_run') ?? ''))}` : '取得中'} link="https://revenue-agent-ops.pages.dev/#applications" />
          <KpiCard label="SNS実験（Muse）" value={exp?.summary ? `${num(exp.summary.total) ?? '—'}テーマ` : '—'}
            sub={exp?.summary ? `実測 ${num(exp.summary.with_measurements) ?? '—'} · 比較可能 ${num(exp.summary.comparisons_ready) ?? '—'} · 採用 ${num(exp.summary.adopted) ?? 0}` : '取得中'} link="https://estateboard.pages.dev/social-analytics/innovation/" />
          <KpiCard label="SNS投稿→反応" value={social?.summary ? `${num(social.summary.successful_posts) ?? '—'} 投稿` : '—'}
            sub={social?.summary ? `反応 ${num(social.summary.total_engagements) ?? '—'} · 保留 ${num(social.summary.pending_posts) ?? '—'} · 失敗 ${num(social.summary.failed_posts) ?? '—'}` : '取得中'} link="https://estateboard.pages.dev/social-analytics/" />
          <KpiCard label="大和ハウス物件" value={daiwa?.counts ? `${num(daiwa.counts.property) ?? '—'} 件` : '—'}
            sub={daiwa?.counts ? `公開可 ${num(daiwa.counts.allowed) ?? 0} · 要確認 ${num(daiwa.counts.needs_review) ?? 0} · 停止 ${num(daiwa.counts.blocked) ?? 0}` : '取得中'} link="https://estateboard.pages.dev/daiwa-posting/" />
          {otherKpis.map((k) => { const p = kpiProgress(k); return <KpiCard key={k.id} label={k.label + (k.period ? ` (${k.period})` : '')} value={k.actual === null ? '—' : k.unit === 'JPY' ? yen(k.actual) : `${k.actual.toLocaleString('ja-JP')}${k.unit}`} sub={p.text} bar={p.pct} link={k.link} tone={p.pct === null ? '' : p.pct >= 50 ? 'good' : p.pct >= 20 ? 'mid' : 'low'} />; })}
          {(state?.metrics ?? []).slice(0, 6).map((m) => <KpiCard key={m.id} label={m.label} value={m.value === null ? '—' : `${typeof m.value === 'number' ? m.value.toLocaleString('ja-JP') : m.value}${m.unit ?? ''}`} sub={`${m.source} · ${fmtJst(m.updatedAt)}`} link={m.link} />)}
        </div>
      </section>

      <UsagePanel usage={state?.usage ?? []} connected={token} onConnect={onConnect} />
      <EarnLabPanel data={earnLab} status={earn.status} target={EARN_TARGET} connected={Boolean(token)} onConnect={onConnect} />
      <SnsPanel parts={(estate.data?.parts as EstateParts | undefined) ?? null} metrics={state?.metrics ?? []} fetchedAt={estate.data?.fetchedAt} />

      <section className="ov-grid2">
        <article className="panel">
          <div className="panel-heading"><div><span className="section-kicker">ACTIVITY</span><h2>AIの活動ログ</h2></div></div>
          {!token && <p className="ov-note">活動ログは認証後に表示されます。</p>}
          <ul className="ov-events">
            {(state?.events ?? []).slice(0, 12).map((e, i) => <li key={i} className={e.kind}><time>{fmtJst(e.at)}</time><span className="who">{e.actor}</span><span>{e.link ? <a href={e.link} target="_blank" rel="noopener noreferrer">{e.message}</a> : e.message}</span></li>)}
            {token && state && state.events.length === 0 && <li className="ov-note">まだイベントがありません。エージェントが log_event を送ると表示されます。</li>}
          </ul>
        </article>
        <article className="panel">
          <div className="panel-heading"><div><span className="section-kicker">SOURCES</span><h2>正本と置き場所</h2></div></div>
          <ul className="ov-sources">
            <li><strong>人間タスク・AIタスク</strong><a href={NOTION} target="_blank" rel="noopener noreferrer">Notion マスタータスクDB ↗</a></li>
            <li><strong>Muse 作業ログ・A/B結果</strong><a href="https://drive.google.com/drive/folders/1VSIKAYmE2HmBazhfY2WymHu0ALy7sC0g" target="_blank" rel="noopener noreferrer">Google Drive 00.Bukken_Master_DB/Muse 作業ログ ↗</a></li>
            <li><strong>不動産・SNS分析</strong><a href="https://estateboard.pages.dev/" target="_blank" rel="noopener noreferrer">EstateBoard ↗</a></li>
            <li><strong>Earn Lab / 求人応募エージェント</strong><a href="https://revenue-agent-ops.pages.dev/" target="_blank" rel="noopener noreferrer">Revenue Agent Ops ↗</a></li>
            <li><strong>実行ログ・監査ログ</strong><a href="https://app.notion.com/p/3ab10562e58b81838599da0e94f39958" target="_blank" rel="noopener noreferrer">Notion 50｜実行ログ索引 ↗</a></li>
            <li><strong>このダッシュボードのコード</strong><a href="https://github.com/univcorp2-ctrl/cloud-local-task-dashboard" target="_blank" rel="noopener noreferrer">GitHub ↗</a></li>
          </ul>
        </article>
      </section>

      <DashboardDirectory />
    </div>
  );
}
