import { describe, expect, it } from 'vitest';
import { buildEarnLab } from '../../api/private-earnlab';

const page = (name: string, state: string, extra: Record<string, unknown> = {}) => ({
  id: name, url: 'https://www.notion.so/' + name, properties: {
    '実験名': { title: [{ plain_text: name }] }, '状態': { select: { name: state } }, 'バリエーション': { select: { name: '01 受託・マイクロタスク' } },
    'スコア': { number: (extra.score as number) ?? null }, '実入金_円': { number: (extra.paid as number) ?? null }, '費用_円': { number: (extra.cost as number) ?? null },
    '見込み_円': { number: (extra.expected as number) ?? null }, '最終更新': { date: { start: (extra.updated as string) ?? '2026-10-30' } },
    '次の一手': { rich_text: [{ plain_text: 'next' }] }, 'Hiroの手順': { rich_text: [{ plain_text: (extra.step as string) ?? '' }] },
  },
});

describe('earn lab aggregate', () => {
  it('counts states, sums verified cash by month and lists active + hiro steps', async () => {
    const now = new Date('2026-10-31T07:00:00Z');
    const result = await buildEarnLab([
      page('A', 'テスト中', { score: 20, expected: 30000, step: '口座確認' }),
      page('B', '拡大', { score: 25, paid: 12000, updated: '2026-10-29' }),
      page('C', '停止', { paid: 5000, updated: '2026-09-10' }),
      page('D', '候補', { score: 10 }),
    ] as never, now);
    expect(result.total).toBe(4);
    expect(result.byState).toEqual({ 'テスト中': 1, '拡大': 1, '停止': 1, '候補': 1 });
    expect(result.cash.paidTotal).toBe(17000);
    expect(result.cash.paidThisMonth).toBe(12000);
    expect(result.cash.expectedActive).toBe(30000);
    expect(result.active.map((r) => r.name)).toEqual(['B', 'A']);
    expect(result.hiroSteps).toHaveLength(1);
  });
});
