import { describe, expect, it } from 'vitest';
import { applyIngest, emptyState, snapshot } from '../state';

const now = new Date('2026-10-31T14:30:00Z');
const item = (over: Record<string, unknown> = {}) => ({ id: 'trig_1', name: 'Earn Lab ループC', platform: 'claude', schedule: 'CRON_TZ=Asia/Tokyo 20 * * * *', scheduleLabel: '毎時:20',
  enabled: true, status: 'running', lastRunAt: '2026-10-31T14:20:00Z', nextRunAt: '2026-10-31T15:20:00Z', runsPerWeek: 168, model: 'opus-5', ...over });

describe('jobs ingest', () => {
  it('replaces a source list and exposes it only when authenticated', () => {
    const state = emptyState();
    const s = applyIngest(state, { jobs: [{ source: 'claude-cloud', label: 'Claude', observedAt: now.toISOString(), items: [item(), item({ id: 'trig_2', status: 'failed' })] }] }, 'sync', now);
    expect(s.jobs).toEqual(['claude-cloud']);
    applyIngest(state, { jobs: [{ source: 'claude-cloud', observedAt: new Date(now.getTime() + 1000).toISOString(), items: [item()] }] }, 'sync', now);
    expect(state.jobs!['claude-cloud'].items).toHaveLength(1);
    const anon = snapshot(state, now.getTime(), false);
    expect(anon.jobs).toEqual([]);
    expect(anon.jobCounts).toEqual({ total: 1, running: 1, failed: 0 });
    expect(snapshot(state, now.getTime(), true).jobs[0].items[0].name).toBe('Earn Lab ループC');
  });
  it('ignores an older observation and rejects bad status', () => {
    const state = emptyState();
    applyIngest(state, { jobs: [{ source: 'x', observedAt: now.toISOString(), items: [item()] }] }, 'a', now);
    applyIngest(state, { jobs: [{ source: 'x', observedAt: '2026-10-30T00:00:00Z', items: [] }] }, 'a', now);
    expect(state.jobs!.x.items).toHaveLength(1);
    expect(() => applyIngest(state, { jobs: [{ source: 'x', observedAt: now.toISOString(), items: [item({ status: 'weird' })] }] }, 'a', now)).toThrow();
  });
});
