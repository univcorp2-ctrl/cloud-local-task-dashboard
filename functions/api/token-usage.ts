/**
 * Same-origin, read-only proxy for the existing public AI operations Worker.
 * Export only aggregate token counts and non-sensitive task metadata.
 * API keys, commands, paths and runtime secrets never cross this boundary.
 */
const UPSTREAM = 'https://ai-operations-state.univcorp2.workers.dev/v1/snapshot/latest';

type RawTask = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
  executor?: unknown;
  status?: unknown;
  lastRunAt?: unknown;
  tokenUsage?: Record<string, unknown>
};
type RawSnapshot = {
  generatedAt?: unknown;
  tokenSummary?: { period?: unknown; total?: unknown; source?: unknown };
  tasks?: RawTask[];
};

function safeText(value: unknown, maximum = 120): string {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}
function safeCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function onRequestGet(): Promise<Response> {
  try {
    const upstream = await fetch(UPSTREAM, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) throw new Error('upstream unavailable');
    const source = await upstream.json() as RawSnapshot;
    if (!source || !Array.isArray(source.tasks)) throw new Error('invalid upstream payload');
    const tasks = source.tasks.map((task) => ({
      id: safeText(task.id),
      name: safeText(task.name),
      executor: safeText(task.executor),
      model: safeText(task.model),
      status: safeText(task.status),
      lastRunAt: safeText(task.lastRunAt),
      tokens: {
        '24h': safeCount(task.tokenUsage?.['24h']),
        '7d': safeCount(task.tokenUsage?.['7d']),
        '30d': safeCount(task.tokenUsage?.['30d']),
      },
    }));
    const result = {
      generatedAt: safeText(source.generatedAt),
      total30d: safeCount(source.tokenSummary?.total),
      period: safeText(source.tokenSummary?.period, 12),
      measuredTaskCount: tasks.filter((task) => task.tokens['30d'] !== null && task.tokens['30d'] > 0).length,
      monitoredTaskCount: tasks.length,
      tasks,
      coverageNote: 'Worker snapshot only; not all Windows tasks, API accounts, subscriptions or provider bills.',
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Usage snapshot is temporarily unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}
