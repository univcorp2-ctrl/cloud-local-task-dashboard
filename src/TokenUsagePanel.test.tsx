import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TokenUsagePanel from './TokenUsagePanel';

const snapshot = {
  generatedAt: '2026-10-19T11:55:17+09:00',
  total30d: 5052660,
  period: '30d',
  monitoredTaskCount: 2,
  measuredTaskCount: 1,
  coverageNote: 'limited',
  tasks: [
    { id: 'test-a', name: '助成金AI', model: 'Codex', executor: 'Codex CLI', status: 'waiting', tokens: { '24h': 914481, '7d': 914481, '30d': 5052660 } },
    { id: 'test-b', name: '新築AI', model: 'none', executor: 'Python', status: 'running', tokens: { '24h': null, '7d': null, '30d': null } },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('displays sourced 30-day usage and a measured coverage denominator', async () => {
  render(<TokenUsagePanel />);
  expect((await screen.findAllByText('5,052,660')).length).toBeGreaterThan(0);
  expect(screen.getByText('2 件')).toBeInTheDocument();
  expect(screen.getByText('1 件')).toBeInTheDocument();
  expect(screen.getAllByText('計測なし').length).toBeGreaterThan(0);
});

test('supports selecting 24-hour usage', async () => {
  render(<TokenUsagePanel />);
  await screen.findAllByText('5,052,660');
  fireEvent.click(screen.getByRole('button', { name: '24時間' }));
  expect(screen.getAllByText('914,481').length).toBeGreaterThan(0);
});

test('does not make up usage values when source fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<TokenUsagePanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('取得に失敗');
  expect(screen.getByText('データ未取得。架空のサンプル値は表示しません。')).toBeInTheDocument();
});
