/**
 * GET /api/private-earnlab — owner-only aggregate of the Notion "🧪 Earn Lab 実験DB".
 * Returns counts by state, verified cash (実入金) totals, costs, expectations and the active
 * experiments with their next action. Cached in KV for 5 minutes. Never public.
 */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';

interface Env extends AuthEnv { TCC_STATE?: KVNamespace; NOTION_API_TOKEN?: string; NOTION_EARNLAB_DATA_SOURCE_ID?: string }
const DEFAULT_DATA_SOURCE = 'de1e04ae-4618-4744-bf5d-ace0b9ac355e';
const CACHE_KEY = 'tcc:earnlab:v1';
const TTL = 300;

interface Page { id: string; url: string; last_edited_time?: string; properties: Record<string, {
  title?: Array<{ plain_text?: string }>; rich_text?: Array<{ plain_text?: string }>; select?: { name: string } | null;
  number?: number | null; date?: { start: string } | null; url?: string | null }> }
const text = (p: Page, k: string) => (p.properties[k]?.title ?? p.properties[k]?.rich_text ?? []).map((x) => x.plain_text ?? '').join('').slice(0, 300);
const sel = (p: Page, k: string) => p.properties[k]?.select?.name ?? '';
const num = (p: Page, k: string) => { const v = p.properties[k]?.number; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
const date = (p: Page, k: string) => p.properties[k]?.date?.start ?? null;

// 2026-10-31 Hiro: iPhone/Apple 買取・返品系は完了済み→「守りのタスク」へ移管。Earn Labの集計・一覧に載せない。
export const MOVED_TO_DEFENSE = /モバトリ|Apple返品|Apple在庫|iPhone買取|買取承認済|森森|カード会社への返金/;

export async function buildEarnLab(pagesIn: Page[], now = new Date()) {
  const moved = pagesIn.filter((p) => MOVED_TO_DEFENSE.test(text(p, '実験名')));
  const pages = pagesIn.filter((p) => !MOVED_TO_DEFENSE.test(text(p, '実験名')));
  const month = now.toISOString().slice(0, 7);
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const rows = pages.map((p) => ({
    id: p.id, url: p.url, name: text(p, '実験名'), state: sel(p, '状態') || '候補', kind: sel(p, '種類'), variation: sel(p, 'バリエーション'),
    score: num(p, 'スコア'), paid: num(p, '実入金_円'), cost: num(p, '費用_円'), expected: num(p, '見込み_円'), runs: num(p, '投入回数'),
    daysToCash: num(p, '入金までの日数'), testedAt: date(p, 'テスト日'), updatedAt: date(p, '最終更新') ?? p.last_edited_time ?? null,
    nextAction: text(p, '次の一手'), hiroStep: text(p, 'Hiroの手順'), result: text(p, 'テスト結果').slice(0, 160), evidence: p.properties['証拠URL']?.url ?? null,
  }));
  const by = (k: 'state' | 'variation') => rows.reduce<Record<string, number>>((acc, r) => { const key = r[k] || '未設定'; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  const sum = (f: (r: typeof rows[number]) => number | null, pred: (r: typeof rows[number]) => boolean = () => true) => rows.filter(pred).reduce((a, r) => a + (f(r) ?? 0), 0);
  const active = rows.filter((r) => r.state === 'テスト中' || r.state === '拡大')
    .sort((a, b) => (a.state === '拡大' ? -1 : 0) - (b.state === '拡大' ? -1 : 0) || (b.score ?? -1) - (a.score ?? -1)).slice(0, 15);
  return {
    generatedAt: now.toISOString(), source: 'Notion Earn Lab 実験DB', total: rows.length,
    byState: by('state'), byVariation: by('variation'),
    cash: { paidTotal: sum((r) => r.paid), paidThisMonth: sum((r) => r.paid, (r) => Boolean(r.paid) && (r.updatedAt ?? '').startsWith(month)),
      paidLast7d: sum((r) => r.paid, (r) => Boolean(r.paid) && (r.updatedAt ?? '') >= weekAgo), costTotal: sum((r) => r.cost),
      expectedActive: sum((r) => r.expected, (r) => r.state === 'テスト中' || r.state === '拡大'), paidCount: rows.filter((r) => (r.paid ?? 0) > 0).length },
    active, hiroSteps: rows.filter((r) => r.hiroStep && (r.state === 'テスト中' || r.state === '拡大' || r.state === '候補')).slice(0, 10)
      .map((r) => ({ id: r.id, url: r.url, name: r.name, state: r.state, step: r.hiroStep.slice(0, 200) })),
    recent: [...rows].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, 8)
      .map((r) => ({ id: r.id, url: r.url, name: r.name, state: r.state, updatedAt: r.updatedAt, result: r.result })),
    month, movedToDefense: moved.length,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const token = env.NOTION_API_TOKEN?.trim();
  const dataSource = (env.NOTION_EARNLAB_DATA_SOURCE_ID || DEFAULT_DATA_SOURCE).trim();
  if (!token) return jsonResponse({ error: 'notion_not_configured' }, 503);
  const refresh = new URL(request.url).searchParams.get('refresh') === '1';
  if (env.TCC_STATE && !refresh) {
    const cached = await env.TCC_STATE.get(CACHE_KEY);
    if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-TCC-Cache': 'hit' } });
  }
  const pages: Page[] = [];
  let cursor: string | null = null;
  try {
    for (let i = 0; i < 6; i += 1) {
      const body: Record<string, unknown> = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSource}/query`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) return jsonResponse({ error: 'notion_query_failed', status: response.status }, 502);
      const data = await response.json() as { results?: Page[]; has_more?: boolean; next_cursor?: string | null };
      pages.push(...(data.results ?? []));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }
  } catch { return jsonResponse({ error: 'notion_unreachable' }, 502); }
  const result = JSON.stringify(await buildEarnLab(pages));
  if (env.TCC_STATE) await env.TCC_STATE.put(CACHE_KEY, result, { expirationTtl: TTL });
  return new Response(result, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-TCC-Cache': 'miss' } });
};
