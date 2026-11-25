import type { PrivateTask } from './notion';

export const PILLARS = ['物件を買う（仕入れ）', '仲介・紹介（手数料）', '資金調達', '営業の型・仕組み', '守り（期限つき）'];
export type WbsTask = PrivateTask & { blockedReasons: string[]; pillar: number | null; group: string; duration: string | null };
export interface WbsData {
  generatedAt: string; source: 'Notion'; truncated: boolean; total: number; heldCount: number;
  hiro: WbsTask[]; unclassified: WbsTask[]; reviews: WbsTask[];
  pillars: Array<{ id: number; title: string; active: number; blocked: number; dueThisWeek: number; groups: Array<{ title: string; tasks: WbsTask[] }> }>;
  schedule: { days: Array<{ date: string; saturday: boolean }>; tasks: WbsTask[] };
}
const DAY = 86_400_000;
export const jstDay = (date: Date) => new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
const dayNumber = (date: string) => Date.parse(date.slice(0, 10) + 'T00:00:00Z');
const dueDay = (date: string) => date.length === 10 ? date : jstDay(new Date(date));
const norm = (id: string) => id.replaceAll('-', '');
const byDue = (a: PrivateTask, b: PrivateTask) => (a.due || '9999').localeCompare(b.due || '9999') || (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id);

export function buildWbs(input: PrivateTask[], now = new Date(), truncated = false): WbsData {
  const today = jstDay(now), start = dayNumber(today);
  const weekEnd = start + (7 - ((new Date(start).getUTCDay() + 6) % 7)) * DAY;
  const parents = new Map(input.map(t => [norm(t.id), t.title]));
  const eligible = input.filter(t => !t.completed && !t.archived);
  const held = (t: PrivateTask) => /⑤|保留/.test(t.priorityGroup ?? '');
  const tasks: WbsTask[] = eligible.filter(t => !held(t)).map(t => {
    const tag = t.wbsSummary?.match(/^\s*柱([1-5])\s*[｜|]\s*([^｜|]*)/);
    const category = t.category;
    const pillar = tag ? Number(tag[1]) : /不動産/.test(category) ? 1 : /営業|連絡/.test(category) ? 2 : /銀行|融資/.test(category) ? 3 : /AI開発|自動化/.test(category) ? 4 : /経理|申告|事務|生活|補助金/.test(category) ? 5 : null;
    const blockedReasons: string[] = [];
    if (/ブロック|停止|エラー/.test(t.status + ' ' + t.executionStatus) || t.autonomy === '実行禁止') blockedReasons.push('ブロック中');
    if (t.due && Number.isFinite(Date.parse(t.due)) && (t.due.length === 10 ? t.due < today : Date.parse(t.due) < now.getTime())) blockedReasons.push('期限超過');
    if (t.lastEditedAt && now.getTime() - Date.parse(t.lastEditedAt) >= 7 * DAY) blockedReasons.push('7日以上更新なし');
    return { ...t, pillar, group: (t.parentIds ?? []).map(id => parents.get(norm(id))).filter(Boolean).join(' / ') || tag?.[2]?.trim() || '中項目未設定', blockedReasons,
      duration: t.estimatedDuration || (t.humanAction + ' ' + t.title).match(/\d+\s*(?:分|時間)/)?.[0] || null };
  }).sort(byDue);
  return {
    source: 'Notion', generatedAt: now.toISOString(), truncated, total: tasks.length, heldCount: eligible.filter(held).length,
    hiro: tasks.filter(t => /Hiro/.test(t.assignedAi && !/未割当/.test(t.assignedAi) ? t.assignedAi : t.owner)).slice(0, 5),
    unclassified: tasks.filter(t => t.pillar === null),
    reviews: tasks.filter(t => /振り返り/.test(t.title + ' ' + t.nextAction)),
    pillars: PILLARS.map((title, i) => {
      const items = tasks.filter(t => t.pillar === i + 1);
      return { id: i + 1, title, active: items.filter(t => !t.blockedReasons.length).length, blocked: items.filter(t => t.blockedReasons.length).length,
        dueThisWeek: items.filter(t => t.due && dayNumber(dueDay(t.due)) >= start && dayNumber(dueDay(t.due)) < weekEnd).length,
        groups: [...new Set(items.map(t => t.group))].map(title => ({ title, tasks: items.filter(t => t.group === title) })) };
    }),
    schedule: { days: Array.from({ length: 28 }, (_, i) => { const date = new Date(start + i * DAY); return { date: date.toISOString().slice(0, 10), saturday: date.getUTCDay() === 6 }; }),
      tasks: tasks.filter(t => t.due && dayNumber(dueDay(t.due)) >= start && dayNumber(dueDay(t.due)) < start + 28 * DAY) },
  };
}
