/**
 * Heartbeat evaluation: which scheduled jobs look stopped or failed.
 * Pure function over the control state so it costs no AI tokens — the 15-minute GitHub Actions
 * cron calls GET /api/heartbeat?notify=1 and only a detected problem wakes a human or an AI.
 */
import type { ControlState, JobItem } from './state';

export type ProblemKind = 'failed' | 'stale' | 'overdue';
export interface HeartbeatProblem {
  source: string; id: string; name: string; platform: JobItem['platform']; kind: ProblemKind;
  lastRunAt: string | null; nextRunAt: string | null; expectedEveryHours: number | null; lateHours: number | null;
}
export interface HeartbeatResult {
  checkedAt: string; alert: boolean; signature: string;
  counts: { watched: number; failed: number; stale: number; overdue: number; staleSources: number };
  staleSources: string[]; problems: HeartbeatProblem[];
}

const HOUR = 3_600_000;
/** A source whose job list has not been refreshed for this long cannot be judged (reported separately). */
export const SOURCE_STALE_HOURS = 48;
const GRACE_HOURS = 2;

export function evaluateHeartbeat(state: ControlState, now = Date.now()): HeartbeatResult {
  const problems: HeartbeatProblem[] = [];
  const staleSources: string[] = [];
  let watched = 0;
  for (const rec of Object.values(state.jobs ?? {})) {
    const observed = Date.parse(rec.observedAt);
    const sourceStale = !Number.isFinite(observed) || now - observed > SOURCE_STALE_HOURS * HOUR;
    if (sourceStale) { staleSources.push(rec.source); continue; }
    for (const j of rec.items) {
      if (!j.enabled || j.oneShot || j.status === 'ended' || j.status === 'paused') continue;
      watched += 1;
      const last = j.lastRunAt ? Date.parse(j.lastRunAt) : NaN;
      const next = j.nextRunAt ? Date.parse(j.nextRunAt) : NaN;
      const every = j.runsPerWeek && j.runsPerWeek > 0 ? (7 * 24) / j.runsPerWeek : null;
      const base = { source: rec.source, id: j.id, name: j.name, platform: j.platform, lastRunAt: j.lastRunAt, nextRunAt: j.nextRunAt, expectedEveryHours: every === null ? null : Math.round(every * 10) / 10 };
      if (j.status === 'failed') { problems.push({ ...base, kind: 'failed', lateHours: null }); continue; }
      if (j.status === 'running') continue;
      // The list itself is a snapshot: judge lateness at the time it was observed, not at "now".
      const ref = Math.min(now, observed);
      if (every !== null && Number.isFinite(last)) {
        const limit = Math.max(every * 2, every + GRACE_HOURS) * HOUR;
        if (ref - last > limit) { problems.push({ ...base, kind: 'stale', lateHours: Math.round(((ref - last) / HOUR) * 10) / 10 }); continue; }
      }
      if (Number.isFinite(next) && ref - next > GRACE_HOURS * HOUR && (!Number.isFinite(last) || last < next)) {
        problems.push({ ...base, kind: 'overdue', lateHours: Math.round(((ref - next) / HOUR) * 10) / 10 });
      }
    }
  }
  problems.sort((a, b) => a.kind.localeCompare(b.kind) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  const count = (k: ProblemKind) => problems.filter((p) => p.kind === k).length;
  const signature = [...problems.map((p) => `${p.kind}:${p.source}:${p.id}`), ...staleSources.sort().map((s) => `src:${s}`)].join('|');
  return {
    checkedAt: new Date(now).toISOString(), alert: problems.length > 0 || staleSources.length > 0, signature,
    counts: { watched, failed: count('failed'), stale: count('stale'), overdue: count('overdue'), staleSources: staleSources.length },
    staleSources, problems,
  };
}

/** Short Telegram text (private channel, so job names are allowed). */
export function heartbeatMessage(r: HeartbeatResult, limit = 12): string {
  const label: Record<ProblemKind, string> = { failed: '失敗', stale: '止まっている', overdue: '予定時刻を過ぎて未実行' };
  const lines = [`🫀 ハートビート警告：失敗${r.counts.failed}件／停止${r.counts.stale}件／未実行${r.counts.overdue}件（監視${r.counts.watched}件）`];
  for (const p of r.problems.slice(0, limit)) lines.push(`・[${label[p.kind]}] ${p.name}（${p.platform}${p.lateHours !== null ? `・${p.lateHours}時間遅れ` : ''}）`);
  if (r.problems.length > limit) lines.push(`…ほか${r.problems.length - limit}件`);
  if (r.staleSources.length) lines.push(`⚠️ 一覧が${SOURCE_STALE_HOURS}時間以上更新されていない収集元：${r.staleSources.join('、')}`);
  lines.push('詳細：https://cloud-local-task-dashboard.pages.dev/#automation');
  return lines.join('\n');
}
