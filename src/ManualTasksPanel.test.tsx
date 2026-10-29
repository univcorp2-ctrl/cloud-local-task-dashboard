import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ManualTasksPanel from './ManualTasksPanel';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
  expect(screen.getAllByText('🏠 不動産').length).toBeGreaterThan(0);
  expect(screen.getByRole('checkbox', { name: /公開テスト用の作業を完了/ })).toBeInTheDocument();
});

test('一覧とカンバン切り替えが利用できる', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tasks: [], generatedAt: '2026-10-19T00:00:00Z' }) }));
  const { container } = render(<ManualTasksPanel />);
  expect(await within(container).findByText('0件（未完了）')).toBeInTheDocument();
  expect(within(container).getByRole('button', { name: /カンバン/ })).toBeInTheDocument();
  expect(within(container).getByRole('button', { name: /一覧/ })).toBeInTheDocument();
});

test('Notion task checkbox saves completion and completed view can restore it', async () => {
  const t = { id:'ab34', url:'https://www.notion.so/ab34', title:'UI操作の確認',
    category:'⚙️ AI開発・自動化', priority:'🟠 高', status:'🔴 未着手',
    owner:'AI', executor:'自動調査', due:null, nextAction:'テスト', humanAction:'' };
  let completed=false;
  const sent: Array<{id: string; completed: boolean}> = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const value = JSON.parse(String(init.body)) as {id: string; completed: boolean};
      sent.push(value);
      completed=value.completed;
      return {ok:true,json:async()=>({ok:true,auditLogged:true})};
    }
    const viewingCompleted=String(url).includes('status=completed');
    return {ok:true,json:async()=>({tasks: (viewingCompleted === completed) ? [t] : []})};
  }));
  render(<ManualTasksPanel />);
  const checkbox = await screen.findByRole('checkbox', {name:'UI操作の確認を完了'});
  fireEvent.click(checkbox);
  await waitFor(()=>expect(sent).toEqual([{id:'ab34',completed:true}]));
  await waitFor(()=>expect(screen.queryByRole('checkbox',{name:'UI操作の確認を完了'})).toBeNull());
  fireEvent.click(screen.getByRole('button',{name:'完了済み・復元'}));
  const restore = await screen.findByRole('checkbox',{name:'UI操作の確認を未完了に戻す'});
  expect(restore).toBeChecked();
  fireEvent.click(restore);
  await waitFor(()=>expect(sent).toEqual([
    {id:'ab34',completed:true},{id:'ab34',completed:false}
  ]));
});
