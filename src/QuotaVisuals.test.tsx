import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import QuotaStrip from './QuotaStrip';
import UsageDonut from './UsageDonut';
beforeEach(() => vi.useRealTimers());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
test('shows three requested AI quotas only', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json: async () => ({ quotas: [
    { provider:'Codex CLI', usedPercent:27, weeklyUsedPercent:44, observedAt:new Date().toISOString(), quality:'measured' },
    { provider:'ChatGPT通常Chat', usedPercent:10, observedAt:new Date().toISOString(), quality:'measured' },
    { provider:'Claude Code CLI', usedPercent:null, quality:'unavailable' },
    { provider:'Gemini / Antigravity CLI', usedPercent:15, observedAt:'2026-05-01T00:00:00Z',quality:'stale' },
  ] }) }));
  render(<QuotaStrip />);
  expect(await screen.findByText('73%')).toBeInTheDocument();
  expect(screen.getByText('56%')).toBeInTheDocument();
  expect(screen.getByText('Antigravity')).toBeInTheDocument();
  expect(screen.queryByText('ChatGPT通常Chat')).toBeNull();
});
test('labels stale samples as historical rather than current', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json: async () => ({ quotas: [
    {provider:'Codex CLI',usedPercent:80,quality:'measured',observedAt:'2026-01-01T00:00:00Z'},
  ] }) }));
  render(<QuotaStrip />);
  expect(await screen.findByText('20%')).toBeInTheDocument();
  expect(screen.getByText('前回値')).toBeInTheDocument();
});
test('donut uses only recorded task shares and displays coverage', () => {
  render(<UsageDonut slices={[{id:'a',label:'補助金調査',tokens:60},{id:'b',label:'不動産調査',tokens:40}]} total={100} coverage="2/116 タスク" />);
  expect(screen.getByRole('img', {name:'計測済みトークンの処理別構成比'})).toBeInTheDocument();
  expect(screen.getByText('60.0%')).toBeInTheDocument();
  expect(screen.getByText('40.0%')).toBeInTheDocument();
  expect(screen.getByText(/2\/116 タスク/)).toBeInTheDocument();
});