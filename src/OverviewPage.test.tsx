import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OverviewPage from './OverviewPage';
import QuotaGauges from './QuotaGauges';
import { TOKEN_KEY, toneOf, untilReset, type QuotaView } from './controlState';

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });
const now = Date.now();
const muse: QuotaView = { provider: 'muse', label: 'Muse', windows: [{ kind: 'weekly', label: '週次無料枠', remainingPercent: 67, usedPercent: 33, resetsAt: new Date(now + 6.5 * 864e5).toISOString() }],
  observedAt: new Date(now - 30 * 6e4).toISOString(), source: 'Drive token_status_payload.json', quality: 'self_reported', staleAfterMinutes: 240, freshness: 'fresh', ageMinutes: 30, primary: null };
muse.primary = muse.windows[0];

test('ゲージは残量%・色・リセットまでの日数・鮮度を表示し、未取得は — で0%にしない', () => {
  render(<QuotaGauges quotas={[muse]} />);
  expect(screen.getByRole('img', { name: '残量 67%' })).toBeInTheDocument();
  expect(screen.getByText(/あと6日/)).toBeInTheDocument();
  expect(screen.getByText(/自己申告 · 30分前/)).toBeInTheDocument();
  expect(screen.getAllByRole('img', { name: '残量 未取得' })).toHaveLength(3);
  expect(toneOf(67)).toBe('healthy'); expect(toneOf(45)).toBe('warning'); expect(toneOf(10)).toBe('critical'); expect(toneOf(null)).toBe('unknown');
  expect(untilReset(new Date(now + 2 * 864e5 + 3 * 36e5).toISOString(), now).days).toBe(2);
});

test('未接続では本人タスクの接続案内、接続済みでは本人タスクとKPIを表示する', async () => {
  let authed = false;
  const state = { ok: true, generatedAt: new Date(now).toISOString(), updatedAt: null, get authenticated() { return authed; }, scope: 'x', quotas: [muse], agents: [], metrics: [], events: [],
    kpis: [{ id: 'earn-lab-monthly-revenue', label: 'Earn Lab 月次売上', unit: 'JPY', target: 5000000, actual: 120000, period: '2026-11', direction: 'up', updatedAt: new Date(now).toISOString(), source: 'notion' }] };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => {
    const url = String(input);
    if (url.includes('/api/state')) return { ok: true, status: 200, json: async () => state };
    if (url.includes('/api/private-tasks')) return { ok: true, status: 200, json: async () => ({ tasks: [{ id: 'a', url: 'https://www.notion.so/a', title: '窓口申込', category: 'x', priority: '🔴 最高', status: '🔴 未着手', owner: '👤 人間', executor: 'Hiro', due: '2026-11-05', nextAction: '', humanAction: '署名', executionStatus: '未着手', completed: false }] }) };
    if (url.includes('/data/tasks.json')) return { ok: true, status: 200, json: async () => ({ generatedAt: '', tasks: [], agents: [], redacted: false }) };
    if (url.includes('/data/development-progress.json')) return { ok: true, status: 200, json: async () => ({ averageProgress: 51, activeProjects: [] }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, fetchedAt: new Date(now).toISOString(), parts: {} }) };
  }));
  render(<OverviewPage onConnect={() => undefined} />);
  expect(await screen.findByText('Notionの本人タスクは認証後に表示されます。')).toBeInTheDocument();
  cleanup();
  authed = true; // owner cookie or stored token
  window.localStorage.setItem(TOKEN_KEY, 'test-token-test-token-test-token');
  render(<OverviewPage onConnect={() => undefined} />);
  expect(await screen.findByText('窓口申込')).toBeInTheDocument();
  expect(await screen.findByText('12万円')).toBeInTheDocument();
  expect(screen.getByText(/目標 500万円（2%）/)).toBeInTheDocument();
});
