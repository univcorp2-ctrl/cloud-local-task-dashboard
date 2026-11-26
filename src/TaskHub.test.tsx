import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskHub, { bucketOf, daysUntil, matches, who, type HubTask } from './TaskHub';

const base: HubTask = { id: 't1', url: 'https://notion.so/t1', title: '納税する', category: '🧾 確定申告・経理', priority: '🔴 最高', status: '🟡 進行中',
  owner: '🤖 AI', executor: 'CLIエージェント', assignedAi: '🤖 Claude', due: null, nextAction: '納付書を出す', humanAction: '', executionStatus: '実行中',
  order: 2, completed: false, priorityClass: '①関所', lastEditedAt: new Date().toISOString() };
const now = new Date('2026-11-26T10:00:00+09:00');

describe('TaskHub helpers', () => {
  it('counts days in JST', () => {
    expect(daysUntil('2026-11-25', now)).toBe(-1);
    expect(daysUntil('2026-11-26', now)).toBe(0);
    expect(daysUntil('2026-11-29T00:00:00.000Z', now)).toBe(3);
  });
  it('puts Hiro rows first and keeps the Notion priority class', () => {
    expect(bucketOf({ ...base, assignedAi: '👤 Hiro' })).toBe('hiro');
    expect(bucketOf({ ...base, assignedAi: '👤 Hiro', priorityClass: '⑤保留' })).toBe('⑤保留');
    expect(bucketOf(base)).toBe('①関所');
    expect(bucketOf({ ...base, priorityClass: '' })).toBe('none');
  });
  it('flags overdue and missing next action', () => {
    expect(matches({ ...base, due: '2026-11-20' }, 'overdue', now)).toBe(true);
    expect(matches({ ...base, nextAction: ' ' }, 'noNext', now)).toBe(true);
    expect(who({ ...base, assignedAi: '⏳ 未割当', owner: '👤 人間' })).toBe('👤 Hiro');
  });
});

describe('TaskHub screen', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shows deals and tasks, completes from the leftmost checkbox and saves an AI instruction', async () => {
    const calls: Array<{ url: string; body?: string; method?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string, method: init?.method });
      if (init?.method === 'PATCH') return new Response(JSON.stringify({ ok: true, auditLogged: true }), { status: 200 });
      if (url.startsWith('/api/private-deals')) return new Response(JSON.stringify({ deals: [{ id: 'd1', url: 'https://notion.so/d1', name: '東村山 ライフピア', stage: '買付済', status: '打診中', rank: 'A', score: 72, genre: '', kind: '中古アパート', area: '東村山市', station: '西武新宿線 久米川駅 徒歩10分', priceMan: 7700, yieldPct: 9.1, offerPriceMan: null, sale: '販売中', owner: 'Claude', nextAction: '売主回答を確認', due: '2026-11-27', risk: '', loan: '', drive: null, listing: null, lastMemo: '', hiroNote: '', hiroNoteAt: null, updatedAt: new Date().toISOString() }] }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [base, { ...base, id: 't2', title: 'パスポート受け取り', assignedAi: '👤 Hiro', priorityClass: '③守り', order: 37 }], recentDone: [] }), { status: 200 });
    }));
    render(<TaskHub onConnect={() => undefined} />);
    expect(await screen.findByText('東村山 ライフピア')).toBeInTheDocument();
    expect(screen.getByText('👤 Hiroにしかできないこと')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('納税するを完了'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.body?.includes('"completed":true'))).toBe(true));
    await waitFor(() => expect(screen.queryByLabelText('納税するを完了')).not.toBeInTheDocument());
    const row = screen.getByText('パスポート受け取り').closest('.th-row') as HTMLElement;
    fireEvent.click(within(row).getByText('✏️ 進捗・指示'));
    fireEvent.change(within(row).getByPlaceholderText(/例：/), { target: { value: '明日10時に行く' } });
    fireEvent.click(within(row).getByText('Notionに保存'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.body?.includes('明日10時に行く'))).toBe(true));
    fireEvent.click(screen.getByLabelText('東村山 ライフピアの次の一手を完了'));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/private-deals' && c.body?.includes('"nextDone":true'))).toBe(true));
  });
  it('asks to connect when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    render(<TaskHub onConnect={() => undefined} />);
    expect(await screen.findByText('接続する')).toBeInTheDocument();
  });
});
