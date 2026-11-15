/**
 * 「稼ぐ・投資」ページのデータ整形（2026-11-15 Hiro指示）。
 * 正本は Notion「💹 稼ぐパイプライン盤」（お金になる流れ＝ストリームごとに1行）。
 * 3軸（稼げる・自動化・将来性 各1〜5）、現金化日数、判定、投資の列は Notion 側で各AIが更新する。
 * ここでは Notion の行を読み、稼ぐ案件／投資案件／守り・その他に分けて「稼げやすい順」に並べるだけ。
 */
export interface NProp {
  title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>;
  select?: { name: string } | null; number?: number | null; date?: { start: string } | null; url?: string | null;
}
export interface NPage { id: string; url: string; last_edited_time?: string; properties: Record<string, NProp> }

const text = (p: NPage, k: string, max = 700) => (p.properties[k]?.title ?? p.properties[k]?.rich_text ?? []).map((x) => x.plain_text ?? '').join('').slice(0, max);
const sel = (p: NPage, k: string) => p.properties[k]?.select?.name ?? '';
const num = (p: NPage, k: string) => { const v = p.properties[k]?.number; return typeof v === 'number' && Number.isFinite(v) ? v : null; };

export type Kind = '稼ぐ案件' | '投資案件' | '守り・その他';
export interface Stream {
  id: string; url: string; name: string; kind: Kind; verdict: string; stage: string;
  earn: number | null; auto: number | null; future: number | null; total: number | null; days: number | null;
  contacts: number | null; replies: number | null; wins: number | null; replyRate: number | null;
  expected: number | null; paid: number | null; prob: number | null; firstCashDate: string | null;
  next: string; issue: string; memo: string;
  capital: number | null; apr: number | null; maxDD: number | null; unrealized: string;
  evidenceUrl: string | null; updatedAt: string | null;
}

export function toStream(p: NPage): Stream {
  const rawKind = sel(p, '種別');
  const kind: Kind = rawKind === '投資案件' || rawKind === '守り・その他' ? rawKind : '稼ぐ案件';
  const earn = num(p, '稼げる'), auto = num(p, '自動化'), future = num(p, '将来性');
  const contacts = num(p, '接触数'), replies = num(p, '返信数');
  return {
    id: p.id, url: p.url, name: text(p, 'ストリーム', 120), kind, verdict: sel(p, '判定'), stage: sel(p, '段階'),
    earn, auto, future, total: earn !== null && auto !== null && future !== null ? earn * 2 + auto + future : null,
    days: num(p, '現金化日数'), contacts, replies, wins: num(p, '受注数'),
    // 返信数が接触数を超える行（1社から複数回の返信など）は率を出さない
    replyRate: contacts !== null && contacts > 0 && replies !== null && replies <= contacts ? replies / contacts : null,
    expected: num(p, '入金見込み_円'), paid: num(p, '実入金_円'), prob: num(p, '確度%'),
    firstCashDate: p.properties['最短入金日']?.date?.start ?? null,
    next: text(p, '次の一手', 260), issue: text(p, '課題', 260), memo: text(p, '評価メモ'),
    capital: num(p, '必要資金_円'), apr: num(p, '想定年利_%'), maxDD: num(p, '最大DD_%'), unrealized: text(p, '含み益の出方', 300),
    evidenceUrl: p.properties['証拠URL']?.url ?? null, updatedAt: p.last_edited_time ?? null,
  };
}

const n = (v: number | null, fallback: number) => v ?? fallback;
const stopped = (s: Stream) => (s.verdict === '停止' ? 1 : 0);

/** 稼げやすい順：停止は最後 → 稼げる点 → 実入金 → 返信率 → 入金が早い順。 */
export const byEarnability = (a: Stream, b: Stream) =>
  stopped(a) - stopped(b) || n(b.earn, 0) - n(a.earn, 0) || n(b.paid, 0) - n(a.paid, 0)
  || n(b.replyRate, -1) - n(a.replyRate, -1) || n(a.days, 9999) - n(b.days, 9999) || a.name.localeCompare(b.name, 'ja');

/** 投資：停止は最後 → 稼げる点 → 想定年利 → 実現が早い順。 */
export const byInvest = (a: Stream, b: Stream) =>
  stopped(a) - stopped(b) || n(b.earn, 0) - n(a.earn, 0) || n(b.apr, -1) - n(a.apr, -1)
  || n(a.days, 9999) - n(b.days, 9999) || a.name.localeCompare(b.name, 'ja');

export function buildEarn(pages: NPage[], now = new Date()) {
  const all = pages.map(toStream).filter((s) => s.name);
  const earn = all.filter((s) => s.kind === '稼ぐ案件').sort(byEarnability);
  const invest = all.filter((s) => s.kind === '投資案件').sort(byInvest);
  const other = all.filter((s) => s.kind === '守り・その他').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const names = (list: Stream[], verdict: string) => list.filter((s) => s.verdict === verdict).map((s) => s.name);
  return {
    generatedAt: now.toISOString(), source: 'Notion 稼ぐパイプライン盤',
    summary: {
      paidTotal: all.reduce((a, s) => a + (s.paid ?? 0), 0),
      focus: names(earn, '集中'), grow: names(earn, '育てる'), stop: names(earn, '停止'),
      earnCount: earn.length, investCount: invest.length, unrated: earn.filter((s) => s.earn === null).length,
    },
    earn, invest, other,
  };
}
