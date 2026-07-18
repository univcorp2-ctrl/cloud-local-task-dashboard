import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';
import { fallbackSnapshot } from './sample';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fallbackSnapshot }));
});

afterEach(() => vi.unstubAllGlobals());

test('主要なダッシュボード情報を表示する', async () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'クラウド & ローカル定期タスク' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('Google Driveバックアップ')).toBeInTheDocument());
  expect(screen.getByText('接続エージェント')).toBeInTheDocument();
});
