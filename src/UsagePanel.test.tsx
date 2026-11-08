import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import UsagePanel, { summarizeQuotas } from './UsagePanel';
import type { QuotaView } from './controlState';

afterEach(cleanup);
const quotas = [91, 14, 2.5, 100].map((used, i) => ({
  provider: ['claude', 'codex', 'antigravity', 'muse'][i], observedAt: new Date().toISOString(),
  freshness: 'fresh', quality: 'measured', windows: [{ kind: i === 2 ? 'model' : 'weekly', usedPercent: used, resetsAt: null }],
})) as QuotaView[];

test('averages four quotas without inventing missing values or mixing token budgets', () => {
  expect(summarizeQuotas(quotas).average).toBe(51.875);
  expect(summarizeQuotas(quotas.slice(0, 3)).average).toBeNull();
  expect(summarizeQuotas(quotas.map((q, i) => i === 0 ? { ...q, freshness: 'stale' } : q)).average).toBeNull();
});

test('shows four providers, quota average and task quality with both denominators', () => {
  render(<UsagePanel quotas={quotas} connected onConnect={vi.fn()} usage={[{
    provider: 'claude', window: '7d', observedAt: new Date().toISOString(), source: 'test', totalTokens: null,
    quotaUsedPercent: 91, basis: 'percent', items: [{ key: 'a', label: '現行タスク', kind: 'scheduled', tokens: null,
      sharePercent: 50, quotaPercent: 45.5, runs: 7, lastAt: null, quality: 'estimated', note: 'runs×時間による按分' }],
  }]} />);
  expect(screen.getByText('51.9%')).toBeInTheDocument();
  expect(screen.getByText('4AI平均')).toBeInTheDocument();
  expect(screen.getByText('現行タスク')).toBeInTheDocument();
  expect(screen.getByText('推定')).toBeInTheDocument();
  expect(screen.getByText('50.0%')).toBeInTheDocument();
  expect(screen.getByText('45.5%')).toBeInTheDocument();
  expect(screen.getAllByText('未計測').length).toBeGreaterThan(0);
});
