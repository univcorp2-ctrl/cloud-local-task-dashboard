/**
 * Earn Lab「どれが稼げるか」推定ロジック（2026-11-15 Hiro指示）。
 *
 * カテゴリー（バリエーション）ごとに、成功確率・見込み額・期待値・現金化までの日数を出す。
 * すべて「推定」。Notion 実験DBの実データ（入金件数・停止件数・見込み_円・入金までの日数・スコア）を
 * カテゴリー別の事前確率（一般的な成約率の目安）とベイズ更新で合わせる。
 *
 * - 確率 p = (p0×K + 入金件数) / (K + 入金件数 + 停止件数×0.3)   … 停止は「失敗」とは限らないので0.3件分として数える
 * - 案件ごとの確率 = p × 状態係数（拡大1.5／テスト中1／縮小・候補0.5）× スコア係数（0.6〜1.4）
 * - 期待値 = Σ 案件ごとの確率 × 見込み_円（同じカテゴリーで同額の見込みは同じ案件の重複とみなし1件に）
 * - 現金化までの日数 = 進行中案件の「入金までの日数」の中央値、無ければ事前値
 */

export interface EvRow {
  id: string; url: string; name: string; state: string; variation: string;
  score: number | null; paid: number | null; expected: number | null; daysToCash: number | null; nextAction: string;
}

export interface CategoryPrior { p0: number; days: number; note: string }

/** 事前確率と標準の現金化日数（推定）。根拠は一般的な成約率・支払サイクルの目安。 */
export const PRIORS: Record<string, CategoryPrior> = {
  '01': { p0: 0.06, days: 21, note: 'クラウド応募の採用率は数%〜1割、検収後の支払いで2〜4週' },
  '02': { p0: 0.15, days: 30, note: 'AIデータ作成は登録審査を通れば単価は低いが入りやすい' },
  '03': { p0: 0.03, days: 45, note: 'バウンティは採択されにくく、支払いまで1〜2か月' },
  '04': { p0: 0.05, days: 60, note: 'コンテスト入賞は低確率・結果発表待ち' },
  '05': { p0: 0.6, days: 60, note: 'ポイントは条件達成でほぼ付与、付与まで1〜3か月' },
  '06': { p0: 0.5, days: 21, note: '既に権利がある未回収・還付は確度が高い' },
  '07': { p0: 0.5, days: 30, note: '固定費削減は手続きすれば翌月から効く' },
  '08': { p0: 0.35, days: 14, note: '物販・買取は売れれば入金が早い' },
  '09': { p0: 0.08, days: 30, note: 'デジタル商品は集客次第で初売上までが長い' },
  '10': { p0: 0.05, days: 30, note: 'ツール販売は買い手探しから' },
  '11': { p0: 0.05, days: 60, note: '紹介料は成約・決済後の支払いで時間がかかる' },
  '12': { p0: 0, days: 0, note: 'ペーパー取引は現金にならない' },
  '13': { p0: 0.3, days: 60, note: 'IPO・優待は当選・権利確定待ち' },
  '14': { p0: 0.1, days: 45, note: '不動産の小さな収益は相手の承諾が必要' },
  '15': { p0: 0.03, days: 45, note: '海外・情報の歪みは新規開拓の返信率が低い' },
  '16': { p0: 0.05, days: 45, note: '成功モデルの再現は検証に時間がかかる' },
  '17': { p0: 0.4, days: 30, note: '謝礼・モニターは参加すればほぼ支払われる' },
  '18': { p0: 0.3, days: 90, note: '補助金は採択後の後払いで入金が遅い' },
  '19': { p0: 0.05, days: 30, note: '分類なし（推定値は控えめ）' },
};
const K = 8;
const STOP_WEIGHT = 0.3;
const ACTIVE = new Set(['テスト中', '拡大']);

const codeOf = (variation: string) => (variation.match(/^(\d{2})/)?.[1]) ?? '19';
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const confidence = (p: number) => (p >= 0.3 ? '高' : p >= 0.1 ? '中' : '低');

export function dealProbability(categoryP: number, state: string, score: number | null): number {
  const stateMult = state === '拡大' ? 1.5 : state === 'テスト中' ? 1 : 0.5;
  const scoreMult = score === null ? 1 : clamp(score / 33, 0.6, 1.4);
  return clamp(categoryP * stateMult * scoreMult, 0, 0.95);
}

export interface Deal { id: string; url: string; name: string; state: string; expected: number; probability: number; ev: number; daysToCash: number; nextAction: string; category: string }
export interface Category {
  code: string; name: string; active: number; deals: number; stopped: number; wins: number; paidTotal: number;
  probability: number; confidence: string; expectedGross: number; ev: number; daysToCash: number; daysEstimated: boolean;
  evPer30d: number; basis: string; topDeal: Deal | null;
}

export function buildCategories(rows: EvRow[]): { categories: Category[]; topDeals: Deal[]; method: string } {
  const groups = new Map<string, EvRow[]>();
  for (const r of rows) { const name = r.variation || '19 その他'; const list = groups.get(name) ?? []; list.push(r); groups.set(name, list); }
  const categories: Category[] = [];
  const allDeals: Deal[] = [];
  for (const [name, list] of groups) {
    const code = codeOf(name);
    const prior = PRIORS[code] ?? PRIORS['19'];
    const wins = list.filter((r) => (r.paid ?? 0) > 0).length;
    const stopped = list.filter((r) => r.state === '停止').length;
    const paidTotal = list.reduce((a, r) => a + (r.paid ?? 0), 0);
    const p = prior.p0 === 0 ? 0 : (prior.p0 * K + wins) / (K + wins + stopped * STOP_WEIGHT);
    const active = list.filter((r) => ACTIVE.has(r.state));
    // 同じカテゴリーで同じ見込み額 → 同じ案件の別タスクとみなして1件にまとめる（スコアが高い方を残す）
    const byAmount = new Map<number, EvRow>();
    for (const r of active) {
      if (!r.expected || r.expected <= 0) continue;
      const prev = byAmount.get(r.expected);
      if (!prev || (r.score ?? 0) > (prev.score ?? 0)) byAmount.set(r.expected, r);
    }
    const dayValues = active.map((r) => r.daysToCash).filter((d): d is number => typeof d === 'number' && d > 0);
    const med = median(dayValues);
    const days = Math.round(med ?? prior.days);
    const deals: Deal[] = [...byAmount.values()].map((r) => {
      const prob = dealProbability(p, r.state, r.score);
      const d = r.daysToCash && r.daysToCash > 0 ? Math.round(r.daysToCash) : days;
      return { id: r.id, url: r.url, name: r.name, state: r.state, expected: r.expected as number, probability: prob, ev: prob * (r.expected as number), daysToCash: d, nextAction: r.nextAction, category: name };
    }).sort((a, b) => b.ev - a.ev);
    allDeals.push(...deals);
    const ev = deals.reduce((a, d) => a + d.ev, 0);
    const expectedGross = deals.reduce((a, d) => a + d.expected, 0);
    categories.push({
      code, name, active: active.length, deals: deals.length, stopped, wins, paidTotal,
      probability: p, confidence: confidence(p), expectedGross, ev, daysToCash: days, daysEstimated: med === null,
      evPer30d: days > 0 ? ev * Math.min(1, 30 / days) : 0,
      basis: `入金${wins}件・停止${stopped}件の実績＋事前確率${Math.round(prior.p0 * 100)}%（${prior.note}）`,
      topDeal: deals[0] ?? null,
    });
  }
  categories.sort((a, b) => b.ev - a.ev || b.probability - a.probability);
  return {
    categories,
    topDeals: allDeals.sort((a, b) => b.ev - a.ev).slice(0, 10),
    method: '推定：確率＝カテゴリーの事前確率と実績（入金・停止）のベイズ更新×状態×スコア。期待値＝確率×見込み額（同額の重複は1件）。日数＝進行中案件の中央値、無ければ標準値。',
  };
}
