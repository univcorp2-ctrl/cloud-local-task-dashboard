import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../kv';
import { applyIngest, emptyState, loadState, normalizeQuota, quotaFreshness, saveState, snapshot, ValidationError } from '../state';

const now = new Date('2026-10-31T01:00:00+09:00');

describe('quota normalization', () => {
  it('derives remaining from used and rejects future observations', () => {
    const q = normalizeQuota({ provider: 'codex', windows: [{ kind: 'weekly', label: '7日', usedPercent: 8, resetsAt: '2026-11-04T08:01:19Z' }],
      observedAt: '2026-10-30T23:50:00+09:00', source: 'codex rate_limits' }, 'pc', now);
    expect(q.windows[0].remainingPercent).toBe(92);
    expect(q.label).toBe('Codex');
    expect(() => normalizeQuota({ provider: 'codex', windows: [{ kind: 'weekly', usedPercent: 1 }], observedAt: '2026-10-31T09:00:00+09:00', source: 'x' }, 'pc', now)).toThrow(ValidationError);
    expect(() => normalizeQuota({ provider: 'codex', windows: [{ kind: 'weekly', usedPercent: 101 }], observedAt: '2026-10-30T23:50:00+09:00', source: 'x' }, 'pc', now)).toThrow(/0..100/);
  });
  it('rejects secrets and e-mail addresses in public text', () => {
    expect(() => normalizeQuota({ provider: 'muse', windows: [{ kind: 'weekly', remainingPercent: 50 }], observedAt: now.toISOString(), source: 'token: abc' }, 'pc', now)).toThrow(/secrets/);
  });
});

describe('ingest + snapshot', () => {
  it('upserts, keeps newest observation, caps events and hides private parts when anonymous', async () => {
    const kv = new MemoryKV();
    const state = emptyState();
    applyIngest(state, { quotas: [{ provider: 'muse', windows: [{ kind: 'weekly', label: '週次無料枠', remainingPercent: 67, resetsAt: '2026-11-06T11:54:00+09:00' }], observedAt: '2026-10-31T00:30:50+09:00', source: 'drive token_status_payload.json' }],
      kpis: [{ id: 'earn-lab-monthly-revenue', label: 'Earn Lab 月次売上', unit: 'JPY', target: 5000000, actual: 0, source: 'notion' }],
    }, 'pc-collector', now);
    for (let batch = 0; batch < 3; batch += 1) {
      applyIngest(state, { events: Array.from({ length: 45 }, (_, i) => ({ message: `event ${batch}-${i}`, at: new Date(now.getTime() - (batch * 45 + i) * 1000).toISOString() })) }, 'pc-collector', now);
    }
    expect(() => applyIngest(state, { events: Array.from({ length: 51 }, () => ({ message: 'x' })) }, 'pc', now)).toThrow(/at most 50/);
    // an older observation must not overwrite
    applyIngest(state, { quotas: [{ provider: 'muse', windows: [{ kind: 'weekly', remainingPercent: 10 }], observedAt: '2026-10-30T00:00:00+09:00', source: 'old' }] }, 'late', now);
    await saveState(kv, state);
    const loaded = await loadState(kv);
    expect(loaded.quotas.muse.windows[0].remainingPercent).toBe(67);
    expect(loaded.events).toHaveLength(120);
    const anon = snapshot(loaded, now.getTime(), false);
    expect(anon.kpis).toEqual([]);
    expect(anon.metrics).toEqual([]);
    expect(anon.events).toEqual([]);
    expect(anon.quotas.find((q) => q.provider === 'muse')?.primary?.remainingPercent).toBe(67);
    expect(anon.quotas.find((q) => q.provider === 'claude')?.freshness).toBe('missing');
    const full = snapshot(loaded, now.getTime(), true);
    expect(full.kpis[0].target).toBe(5000000);
  });
  it('marks stale and ancient observations honestly', () => {
    const q = normalizeQuota({ provider: 'claude', windows: [{ kind: 'weekly', remainingPercent: 40 }], observedAt: '2026-10-30T20:00:00+09:00', source: 's', staleAfterMinutes: 60 }, 'pc', now);
    expect(quotaFreshness(q, now.getTime()).freshness).toBe('stale');
    const ancient = normalizeQuota({ provider: 'claude', windows: [{ kind: 'weekly', remainingPercent: 40 }], observedAt: '2026-10-01T20:00:00+09:00', source: 's' }, 'pc', now);
    expect(quotaFreshness(ancient, now.getTime()).freshness).toBe('missing');
  });
});
