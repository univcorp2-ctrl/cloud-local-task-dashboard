import { describe, expect, it } from 'vitest';
import { buildCategories, dealProbability, type EvRow } from '../earnlab-ev';
import { newPairCode, normalizePairCode } from '../pair';

const row = (o: Partial<EvRow>): EvRow => ({ id: Math.random().toString(36), url: 'https://n/x', name: 'x', state: 'テスト中', variation: '01 受託・マイクロタスク', score: 33, paid: null, expected: null, daysToCash: null, nextAction: '', ...o });

describe('Earn Lab カテゴリー別の期待値', () => {
  it('同じカテゴリーの同額見込みは1件にまとめ、期待値=確率×見込み額', () => {
    const r = buildCategories([
      row({ variation: '06 未回収・還付・眠ったお金', expected: 100000, score: 30 }),
      row({ variation: '06 未回収・還付・眠ったお金', expected: 100000, score: 40, name: 'keep' }),
      row({ variation: '06 未回収・還付・眠ったお金', expected: 50000, daysToCash: 10 }),
    ]);
    const c = r.categories[0];
    expect(c.deals).toBe(2);
    expect(c.expectedGross).toBe(150000);
    expect(c.topDeal?.name).toBe('keep');
    expect(c.ev).toBeCloseTo(c.topDeal!.ev + dealProbability(c.probability, 'テスト中', 33) * 50000, 5);
    expect(c.daysToCash).toBe(10);
    expect(c.daysEstimated).toBe(false);
  });

  it('停止が多いカテゴリーは確率が下がり、入金実績があると上がる', () => {
    const many = Array.from({ length: 50 }, () => row({ variation: '15 情報の歪み・地域差・海外', state: '停止' }));
    const low = buildCategories([...many, row({ variation: '15 情報の歪み・地域差・海外', expected: 1000 })]).categories[0];
    const won = buildCategories([row({ variation: '15 情報の歪み・地域差・海外', paid: 5000, state: '停止' }), row({ variation: '15 情報の歪み・地域差・海外', expected: 1000 })]).categories[0];
    expect(low.probability).toBeLessThan(0.03);
    expect(won.probability).toBeGreaterThan(0.03);
    expect(low.confidence).toBe('低');
  });

  it('日数が無ければ標準値、期待値順に並ぶ', () => {
    const r = buildCategories([row({ variation: '08 物販・価格差', expected: 1_000_000 }), row({ variation: '01 受託・マイクロタスク', expected: 10_000 })]);
    expect(r.categories[0].name).toBe('08 物販・価格差');
    expect(r.categories[0].daysEstimated).toBe(true);
    expect(r.categories[0].daysToCash).toBe(14);
    expect(r.topDeals[0].category).toBe('08 物販・価格差');
  });

  it('ペーパー取引は現金にならないので確率0', () => {
    const r = buildCategories([row({ variation: '12 投資ペーパー（株・FX・暗号）', expected: 50000 })]);
    expect(r.categories[0].ev).toBe(0);
  });
});

describe('ペアリングコード', () => {
  it('8文字で紛らわしい文字を含まない', () => {
    for (let i = 0; i < 50; i += 1) expect(newPairCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });
  it('空白・小文字・ハイフンを正規化', () => {
    expect(normalizePairCode(' abcd-ef23 ')).toBe('ABCDEF23');
  });
});
