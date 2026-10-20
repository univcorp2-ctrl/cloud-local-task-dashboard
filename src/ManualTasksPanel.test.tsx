import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ManualTasksPanel from './ManualTasksPanel';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 })); });
afterEach(() => { vi.unstubAllGlobals(); });

test('未認証時に非公開タスクを表示せずNotionへの導線を残す', async () => {
  render(<ManualTasksPanel />);
  expect(await screen.findByText(/認証・Notion連携が未設定/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /10領域別・未完了/ })).toHaveAttribute('href', expect.stringContaining('notion.so'));
  expect(screen.queryByText('機密サンプル')).toBeNull();
});

test('認証されたNotionタスクをカテゴリーと優先度付きで表示する', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    tasks: [{ id: 'a', url: 'https://www.notion.so/a', title: '公開テスト用の作業',
      category: '🏠 不動産', priority: '🔴 最高', status: '🔴 未着手',
      owner: '👤 人間', executor: 'Hiro', due: null, nextAction: '確認する', humanAction: '' }],
    generatedAt: '2026-10-19T00:00:00Z',
  }) }));
  render(<ManualTasksPanel />);
  expect(await screen.findByText('公開テスト用の作業 ↗')).toBeInTheDocument();
  expect(screen.getByText('🏠 不動産')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /公開テスト用の作業を完了/ })).toBeInTheDocument();
});

test('一覧とカンバン切り替えが利用できる', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [], generatedAt: '2026-10-19T00:00:00Z' }) }));
  render(<ManualTasksPanel />);
  expect(await screen.findByText('0件（未完了）')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /カンバン/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /一覧/ })).toBeInTheDocument();
});
