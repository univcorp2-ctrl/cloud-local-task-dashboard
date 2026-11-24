import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WbsPage from './WbsPage';
import { buildWbs } from '../functions/_lib/wbs';

vi.mock('./controlState', () => ({ authHeaders: () => ({}), useOwnerToken: () => [''] }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('WBS page', () => {
  it('loads private data, polls and forces manual refresh, with explicit calendar limitation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => buildWbs([]) });
    vi.stubGlobal('fetch', fetcher);
    render(<WbsPage onConnect={() => {}} />);
    await act(async () => {});
    expect(screen.getByText('柱1｜物件を買う（仕入れ）')).toBeInTheDocument();
    expect(screen.getByText(/カレンダーとの照合は未接続/)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => fireEvent.click(screen.getByRole('button', {name:'Notionから今すぐ更新'})));
    expect(fetcher.mock.calls[2][0]).toBe('/api/private-wbs?refresh=1');
  });
  it('clears data on failed auth and offers connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false,status:401}));
    const connect = vi.fn();
    render(<WbsPage onConnect={connect} />);
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('本人接続が必要');
    fireEvent.click(screen.getByRole('button', { name: '接続設定を開く' }));
    expect(connect).toHaveBeenCalledOnce();
  });
});
