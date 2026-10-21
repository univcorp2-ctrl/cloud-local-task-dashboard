import { fireEvent, render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import QuotaStrip, { untilReset } from './QuotaStrip';
import UsageDonut from './UsageDonut';
beforeEach(() => vi.useRealTimers());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('keeps Codex Claude and Antigravity 7-day quota above the fold with name and percent together', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json: async () => ({ quotas: [
    { provider:'Codex CLI', usedPercent:27, weeklyUsedPercent:44, observedAt:new Date().toISOString(), quality:'measured' },
    { provider:'ChatGPT通常Chat', usedPercent:10, observedAt:new Date().toISOString(), quality:'measured' },
    { provider:'Claude Code CLI', usedPercent:null, quality:'unavailable' },
    { provider:'Gemini / Antigravity CLI', usedPercent:15, observedAt:'2026-05-01T00:00:00Z', quality:'stale' },
  ] }) }));
  const { container } = render(<header className="topbar"><QuotaStrip /></header>);
  expect(await screen.findByText('56%')).toBeInTheDocument();
  const strip = screen.getByRole('group', { name: /AI別 7日間利用枠の残量/ });
  expect(within(strip).getByText('7日残量')).toBeInTheDocument();
  const codex = within(strip).getByLabelText('Codex 7日間の残量 56%');
  expect(codex.querySelector('.quota-week-amount')?.textContent).toBe('56%');
  expect(container.querySelector('header.topbar .quota-strip')).not.toBeNull();
  expect(within(strip).getByLabelText('Antigravity 7日間の残量 未取得')).toBeInTheDocument();
  expect(screen.queryByText('ChatGPT通常Chat')).toBeNull();
  fireEvent.click(screen.getByLabelText('5時間枠と観測日時の詳細を開く'));
  expect(screen.getByText(/5時間 73%/)).toBeInTheDocument();
});
test('never promotes stale Antigravity or Codex records as current weekly balance', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json: async () => ({ quotas: [
    { provider:'Codex CLI', usedPercent:80,weeklyUsedPercent:70,quality:'measured',observedAt:'2026-01-01T00:00:00Z' },
    { provider:'Gemini / Antigravity CLI', usedPercent:1,quality:'stale',observedAt:'2026-05-01T00:00:00Z' },
  ] }) }));
  render(<QuotaStrip />);
  expect(await screen.findByLabelText('Codex 7日間の残量 未取得')).toBeInTheDocument();
  expect(screen.getByLabelText('Antigravity 7日間の残量 未取得')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('5時間枠と観測日時の詳細を開く'));
  expect(screen.getAllByText(/旧記録/).length).toBeGreaterThan(0);
});
test('donut represents observed task shares only and displays coverage', () => {
  render(<UsageDonut slices={[{id:'a',label:'補助金調査',tokens:60},{id:'b',label:'不動産調査',tokens:40}]} total={100} coverage="2/116 タスク" />);
  expect(screen.getByRole('img', {name:'計測済みトークンの処理別構成比'})).toBeInTheDocument();
  expect(screen.getByText('60.0%')).toBeInTheDocument();
  expect(screen.getByText('40.0%')).toBeInTheDocument();
  expect(screen.getByText(/2\/116 タスク/)).toBeInTheDocument();
});
test('weekly reset countdown is driven by a real provider reset timestamp', () => {
  const now = Date.parse('2026-10-21T04:00:00Z');
  expect(untilReset('2026-10-24T06:00:00Z', now)).toBe('あと3日2時間');
  expect(untilReset('2026-10-21T04:42:00Z', now)).toBe('あと42分');
  expect(untilReset(null, now)).toBe('更新日不明');
  expect(untilReset('2026-10-20T00:00:00Z', now)).toBe('更新時刻確認中');
});

test('renders Tokyo-local date and reset days beside named weekly quota', async () => {
  const observed = new Date().toISOString();
  const weeklyReset = new Date(Date.now() + 3 * 86400000).toISOString();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async()=>({quotas:[
    {provider:'Codex CLI',weeklyUsedPercent:25,usedPercent:10,weeklyResetAt:weeklyReset,observedAt:observed,quality:'measured'}
  ]})}));
  render(<QuotaStrip />);
  expect(await screen.findByText('75%')).toBeInTheDocument();
  expect(screen.getByLabelText('今日の日付と日本時間')).toBeInTheDocument();
  expect(screen.getAllByText(/あと2日|あと3日/).length).toBeGreaterThan(0);
});
