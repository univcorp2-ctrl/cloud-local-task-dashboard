import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TokenUsagePanel from './TokenUsagePanel';

const snapshot = {
  generatedAt: '2026-10-20T13:35:00+09:00',
  total30d: 5_052_660,
  period: '30d',
  monitoredTaskCount: 7,
  measuredTaskCount: 1,
  coverageNote: 'Worker-linked only',
  tasks: [
    { id: 'a', name: '補助金の自動調査', model: 'Codex', executor: 'Codex CLI', status: 'waiting',
      lastRunAt: '2026-10-19T08:59:07+09:00', tokens: { '24h': 50, '7d': 914481, '30d': 5052660 } },
    { id: 'b', name: '不動産レポート', model: 'Codex', executor: 'Codex CLI', status: 'waiting',
      lastRunAt: '2026-10-18T08:00:00+09:00', tokens: { '24h': 100, '7d': 0, '30d': 0 } },
    { id: 'c', name: 'ROOM投稿', model: 'Antigravity', executor: 'Antigravity CLI', status: 'waiting',
      tokens: { '24h': null, '7d': null, '30d': null } },
  ],
};
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('makes the top-consuming execution and measured denominator visible', async () => {
  render(<TokenUsagePanel />);
  expect((await screen.findAllByText('5,052,660')).length).toBeGreaterThan(0);
  expect(screen.getByText(/\/ 7 処理/)).toBeInTheDocument();
  expect(screen.getByText('30日')).toHaveAttribute('aria-pressed', 'true');
  const region = screen.getByRole('region', { name: 'トークン使用率と全体比率' });
  expect(within(region).getByText('100%')).toBeInTheDocument();
  expect(within(region).getAllByText('記録なし').length).toBeGreaterThan(0);
  expect(screen.queryByText('ChatGPT通常Chat')).toBeNull();
});

test('reorders tasks by actual token usage when period changes', async () => {
  render(<TokenUsagePanel />);
  await screen.findAllByText('5,052,660');
  fireEvent.click(screen.getByRole('button', { name: '24時間' }));
  const region = screen.getByRole('region', { name: 'トークン使用率と全体比率' });
  const rows = within(region).getAllByRole('row');
  expect(rows[1].textContent).toContain('不動産レポート');
  expect(rows[2].textContent).toContain('補助金の自動調査');
  expect(within(region).getByText('66.7%')).toBeInTheDocument();
});

test('does not infer true zero usage from missing observations', async () => {
  render(<TokenUsagePanel />);
  await screen.findAllByText('5,052,660');
  expect(screen.getAllByText('トークン計測の確認待ち').length).toBe(2);
});

test('does not fabricate figures when API fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  render(<TokenUsagePanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('計測データを取得できません');
  expect(screen.queryByText('5,052,660')).toBeNull();
});
