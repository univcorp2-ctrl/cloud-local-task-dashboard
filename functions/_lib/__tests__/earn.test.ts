import { describe, expect, it } from 'vitest';
import { buildEarn, type NPage, type NProp } from '../earn';

const page = (name: string, props: Record<string, NProp> = {}): NPage => ({
  id: name, url: 'https://n/' + name, last_edited_time: '2026-11-15T00:00:00Z',
  properties: { ストリーム: { title: [{ plain_text: name }] }, ...props },
});
const s = (name: string) => ({ select: { name } });
const v = (number: number) => ({ number });

describe('稼ぐ・投資の並べ替え', () => {
  const data = buildEarn([
    page('小口', { 種別: s('稼ぐ案件'), 判定: s('継続'), 稼げる: v(2), 自動化: v(4), 将来性: v(2), 現金化日数: v(14) }),
    page('紹介料', { 種別: s('稼ぐ案件'), 判定: s('集中'), 稼げる: v(5), 自動化: v(3), 将来性: v(5), 現金化日数: v(75), 実入金_円: v(4180000), 接触数: v(39), 返信数: v(15) }),
    page('止めた営業', { 種別: s('稼ぐ案件'), 判定: s('停止'), 稼げる: v(3), 自動化: v(5), 将来性: v(2) }),
    page('未評価の新しい行'),
    page('国債', { 種別: s('投資案件'), 判定: s('継続'), 稼げる: v(1), '想定年利_%': v(1.85), '最大DD_%': v(0), 現金化日数: v(180) }),
    page('不動産', { 種別: s('投資案件'), 判定: s('集中'), 稼げる: v(5), 現金化日数: v(90) }),
    page('転職', { 種別: s('守り・その他') }),
  ]);

  it('稼ぐ案件は稼げる点が高い順、停止は最後、種別なしは稼ぐ案件に入る', () => {
    expect(data.earn.map((x) => x.name)).toEqual(['紹介料', '小口', '未評価の新しい行', '止めた営業']);
    expect(data.earn[0].total).toBe(18);
    expect(data.earn[0].replyRate).toBeCloseTo(15 / 39, 5);
    expect(data.earn[2].total).toBeNull();
  });

  it('投資案件と守りは別枠', () => {
    expect(data.invest.map((x) => x.name)).toEqual(['不動産', '国債']);
    expect(data.invest[1].apr).toBe(1.85);
    expect(data.other.map((x) => x.name)).toEqual(['転職']);
  });

  it('まとめ：実入金の合計・集中・停止・未評価の数', () => {
    expect(data.summary.paidTotal).toBe(4180000);
    expect(data.summary.focus).toEqual(['紹介料']);
    expect(data.summary.stop).toEqual(['止めた営業']);
    expect(data.summary.unrated).toBe(1);
  });
});
