import { expect, test } from 'vitest';
import { emptyState, type JobItem } from '../state';
import { evaluateHeartbeat, heartbeatMessage } from '../heartbeat';

const NOW = Date.parse('2026-11-12T08:00:00Z');
const job = (over: Partial<JobItem>): JobItem => ({
  id: 'j', name: 'job', platform: 'claude', schedule: '', scheduleLabel: null, enabled: true, oneShot: false, status: 'success',
  lastRunAt: null, lastFinishedAt: null, nextRunAt: null, durationSeconds: null, model: null, runsPerWeek: null, category: null, note: null, link: null, ...over,
});
const stateWith = (items: JobItem[], observedAt = '2026-11-12T07:50:00Z') => {
  const s = emptyState();
  s.jobs = { 'claude-cloud': { source: 'claude-cloud', label: 'Claude', observedAt, updatedAt: observedAt, actor: 't', items } };
  return s;
};

test('毎日動くはずのタスクが2日以上動いていなければ停止、失敗は失敗として出す', () => {
  const r = evaluateHeartbeat(stateWith([
    job({ id: 'ok', runsPerWeek: 7, lastRunAt: '2026-11-12T00:00:00Z' }),
    job({ id: 'stale', name: '止まった日次', runsPerWeek: 7, lastRunAt: '2026-11-09T00:00:00Z' }),
    job({ id: 'bad', name: '失敗した', status: 'failed', runsPerWeek: 7, lastRunAt: '2026-11-12T00:00:00Z' }),
    job({ id: 'late', nextRunAt: '2026-11-12T03:00:00Z', lastRunAt: '2026-11-11T03:00:00Z' }),
    job({ id: 'off', enabled: false, runsPerWeek: 7, lastRunAt: '2026-10-01T00:00:00Z' }),
    job({ id: 'once', oneShot: true, nextRunAt: '2026-11-01T00:00:00Z' }),
  ]), NOW);
  expect(r.alert).toBe(true);
  expect(r.counts).toEqual({ watched: 4, failed: 1, stale: 1, overdue: 1, staleSources: 0 });
  expect(r.problems.map((p) => `${p.kind}:${p.id}`)).toEqual(['failed:bad', 'overdue:late', 'stale:stale']);
  expect(heartbeatMessage(r)).toContain('止まった日次');
});

test('全部正常なら警告なし・署名は空', () => {
  const r = evaluateHeartbeat(stateWith([job({ runsPerWeek: 21, lastRunAt: '2026-11-12T05:00:00Z' })]), NOW);
  expect(r.alert).toBe(false);
  expect(r.signature).toBe('');
});

test('一覧が48時間以上古い収集元は判定せず、収集元の停止として出す', () => {
  const r = evaluateHeartbeat(stateWith([job({ runsPerWeek: 7, lastRunAt: '2026-11-01T00:00:00Z' })], '2026-11-09T00:00:00Z'), NOW);
  expect(r.counts.staleSources).toBe(1);
  expect(r.problems).toEqual([]);
  expect(r.alert).toBe(true);
});
