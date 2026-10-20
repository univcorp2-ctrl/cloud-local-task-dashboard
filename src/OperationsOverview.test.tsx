import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import OperationsOverview from './OperationsOverview';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function load(quotas: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ categories: [], quotas }) }));
  render(<OperationsOverview section="quota" />);
}

test('one row per AI shows both windows, resets and observation status', async () => {
  load([{ provider: 'Codex CLI', usedPercent: 0, weeklyUsedPercent: 27, quality: 'measured',
    observedAt: new Date().toISOString(), resetAt: '2026-10-21T03:00:00Z', weeklyResetAt: '2026-10-24T03:00:00Z' }]);
  const row = await screen.findByRole('article', { name: 'Codex CLI' });
  expect(within(row).getByText('0%')).toBeInTheDocument();
  expect(within(row).getByText('27%')).toBeInTheDocument();
  expect(within(row).getByText('実測')).toBeInTheDocument();
  expect(row.querySelectorAll('time')).toHaveLength(3);
});

test('old Codex values are historical and invalid weekly values are unknown', async () => {
  load([{ provider: 'Codex CLI', usedPercent: 78, weeklyUsedPercent: 101, quality: 'measured',
    observedAt: '2020-01-01T00:00:00Z' }]);
  const row = await screen.findByRole('article', { name: 'Codex CLI' });
  expect(within(row).getByText(/stale/)).toBeInTheDocument();
  expect(within(row).queryByText('101%')).not.toBeInTheDocument();
  expect(within(row).getByText('前回 78%')).toBeInTheDocument();
});

test('Antigravity model quota is not labeled as a five hour or weekly observation', async () => {
  load([{ provider: 'Gemini / Antigravity CLI', usedPercent: 60, windowLabel: 'モデル別',
    quality: 'measured', observedAt: new Date().toISOString(), model: 'Gemini Pro',
    modelPools: [{ category: 'Gemini Pro', usedPercent: 60, quality: 'measured',
      observedAt: new Date().toISOString(), resetAt: null }] }]);
  const row = await screen.findByRole('article', { name: 'Gemini / Antigravity CLI' });
  expect(within(row).getByText('モデル別')).toBeInTheDocument();
  expect(within(row).getByRole('img', { name: 'モデル別 使用率 60%' })).toBeInTheDocument();
  expect(within(row).getByRole('img', { name: '7日間 使用率不明' })).toBeInTheDocument();
});

test('quota fetch failure is visible without the catalog section', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<OperationsOverview section="quota" />);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

test('repeated failed polls still age a measured observation into stale', async () => {
  vi.useFakeTimers();
  const observedAt = new Date().toISOString();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ categories: [],
    quotas: [{ provider: 'Codex CLI', usedPercent: 25, quality: 'measured', observedAt }] }) })
    .mockRejectedValue(new Error('offline')));
  render(<OperationsOverview section="quota" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText('実測')).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(32 * 60 * 1000); });
  expect(screen.getByText(/stale（30分超/)).toBeInTheDocument();
  expect(screen.getByText('前回 25%')).toBeInTheDocument();
});
