/**
 * Control-center live state: AI quotas, KPIs, metrics, agent heartbeats and an event feed.
 *
 * Stored as ONE JSON document in KV (`tcc:state:v1`). Writers (PC collector, AI agents via
 * MCP/ingest) upsert individual records; readers get the merged public-safe document.
 * Every record carries `observedAt`/`updatedAt` so the UI can show freshness honestly:
 * a missing or old observation is "未取得/前回値", never 0% or 100%.
 */
import type { KVLike } from './kv';

export const STATE_KEY = 'tcc:state:v1';
export const PROVIDERS = ['claude', 'codex', 'antigravity', 'muse', 'chatgpt'] as const;
export type Provider = typeof PROVIDERS[number];
export const PROVIDER_LABEL: Record<Provider, string> = {
  claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', muse: 'Muse', chatgpt: 'ChatGPT',
};

export interface QuotaWindow {
  kind: 'five_hour' | 'weekly' | 'monthly' | 'model' | 'additional' | 'other';
  label: string;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
  remainingText?: string | null;
  note?: string | null;
}
export interface QuotaRecord {
  provider: Provider;
  label: string;
  windows: QuotaWindow[];
  observedAt: string;
  updatedAt: string;
  source: string;
  quality: 'measured' | 'estimated' | 'self_reported';
  staleAfterMinutes: number;
  actor: string;
  note?: string | null;
}
export interface KpiRecord {
  id: string; label: string; unit: string; target: number | null; actual: number | null;
  period: string | null; direction: 'up' | 'down'; updatedAt: string; source: string;
  link?: string | null; note?: string | null; group?: string | null; actor: string;
}
export interface MetricRecord {
  id: string; label: string; value: number | string | null; unit?: string | null;
  updatedAt: string; source: string; link?: string | null; note?: string | null; group?: string | null; actor: string;
}
export interface EventRecord {
  at: string; actor: string; kind: 'info' | 'success' | 'warning' | 'error';
  message: string; link?: string | null; topic?: string | null;
}
export interface AgentRecord {
  name: string; status: 'running' | 'idle' | 'blocked' | 'offline';
  currentTask?: string | null; lastSeenAt: string; nextRunAt?: string | null; note?: string | null;
}
export interface ControlState {
  version: 1;
  updatedAt: string | null;
  quotas: Record<string, QuotaRecord>;
  kpis: Record<string, KpiRecord>;
  metrics: Record<string, MetricRecord>;
  agents: Record<string, AgentRecord>;
  events: EventRecord[];
}

export const EVENT_LIMIT = 120;
const TEXT_LIMIT = 240;
const ID_RE = /^[a-z][a-z0-9_.-]{1,60}$/;
const SECRET_LIKE = /\b(?:bearer|api[_ -]?key|secret|token|password)\b\s*[:=]|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;

export class ValidationError extends Error {}

export function emptyState(): ControlState {
  return { version: 1, updatedAt: null, quotas: {}, kpis: {}, metrics: {}, agents: {}, events: [] };
}

export async function loadState(kv: KVLike): Promise<ControlState> {
  const raw = await kv.get(STATE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<ControlState>;
    return { ...emptyState(), ...parsed, version: 1 };
  } catch {
    return emptyState();
  }
}

export async function saveState(kv: KVLike, state: ControlState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await kv.put(STATE_KEY, JSON.stringify(state));
}

// ----------------------------------------------------------------------------- validators
function text(value: unknown, field: string, max = TEXT_LIMIT, required = false): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} required`);
    return '';
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const cleaned = value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  if (SECRET_LIKE.test(cleaned)) throw new ValidationError(`${field} must not contain secrets or e-mail addresses`);
  return cleaned;
}
function percent(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError(`${field} must be 0..100`);
  }
  return Math.round(value * 10) / 10;
}
function isoTime(value: unknown, field: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} required`);
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new ValidationError(`${field} must be ISO-8601`);
  return new Date(value).toISOString();
}
function link(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a URL string`);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('https only');
    return url.toString().slice(0, 400);
  } catch {
    throw new ValidationError(`${field} must be an https URL`);
  }
}
function number(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(`${field} must be a number`);
  return value;
}
function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw new ValidationError(`${field} must match ${ID_RE}`);
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw new ValidationError(`${field} required`);
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`${field} must be one of ${allowed.join('|')}`);
  }
  return value as T;
}

// ----------------------------------------------------------------------------- normalizers
export function normalizeQuota(input: unknown, actor: string, now = new Date()): QuotaRecord {
  if (!input || typeof input !== 'object') throw new ValidationError('quota object required');
  const x = input as Record<string, unknown>;
  const provider = oneOf(x.provider, PROVIDERS, 'provider');
  const rawWindows = Array.isArray(x.windows) ? x.windows : [];
  if (!rawWindows.length) throw new ValidationError('windows[] required (at least one)');
  const windows: QuotaWindow[] = rawWindows.slice(0, 6).map((w, i) => {
    if (!w || typeof w !== 'object') throw new ValidationError(`windows[${i}] must be an object`);
    const r = w as Record<string, unknown>;
    const remaining = percent(r.remainingPercent, `windows[${i}].remainingPercent`);
    const used = percent(r.usedPercent, `windows[${i}].usedPercent`);
    if (remaining === null && used === null) throw new ValidationError(`windows[${i}] needs remainingPercent or usedPercent`);
    return {
      kind: oneOf(r.kind, ['five_hour', 'weekly', 'monthly', 'model', 'additional', 'other'] as const, `windows[${i}].kind`, 'other'),
      label: text(r.label, `windows[${i}].label`, 40) || '利用枠',
      remainingPercent: remaining ?? (used === null ? null : Math.round((100 - used) * 10) / 10),
      usedPercent: used ?? (remaining === null ? null : Math.round((100 - remaining) * 10) / 10),
      resetsAt: isoTime(r.resetsAt, `windows[${i}].resetsAt`),
      remainingText: text(r.remainingText, `windows[${i}].remainingText`, 32) || null,
      note: text(r.note, `windows[${i}].note`, 120) || null,
    };
  });
  const observedAt = isoTime(x.observedAt, 'observedAt', true) as string;
  if (Date.parse(observedAt) > now.getTime() + 5 * 60_000) throw new ValidationError('observedAt is in the future');
  const stale = number(x.staleAfterMinutes, 'staleAfterMinutes');
  return {
    provider,
    label: PROVIDER_LABEL[provider],
    windows,
    observedAt,
    updatedAt: now.toISOString(),
    source: text(x.source, 'source', 120, true),
    quality: oneOf(x.quality, ['measured', 'estimated', 'self_reported'] as const, 'quality', 'measured'),
    staleAfterMinutes: stale && stale >= 5 && stale <= 7 * 1440 ? Math.round(stale) : 180,
    actor: text(actor, 'actor', 40) || 'unknown',
    note: text(x.note, 'note', 200) || null,
  };
}

export function normalizeKpi(input: unknown, actor: string, now = new Date()): KpiRecord {
  if (!input || typeof input !== 'object') throw new ValidationError('kpi object required');
  const x = input as Record<string, unknown>;
  return {
    id: id(x.id, 'id'),
    label: text(x.label, 'label', 80, true),
    unit: text(x.unit, 'unit', 16) || '',
    target: number(x.target, 'target'),
    actual: number(x.actual, 'actual'),
    period: text(x.period, 'period', 24) || null,
    direction: oneOf(x.direction, ['up', 'down'] as const, 'direction', 'up'),
    updatedAt: (isoTime(x.updatedAt, 'updatedAt') ?? now.toISOString()),
    source: text(x.source, 'source', 120, true),
    link: link(x.link, 'link'),
    note: text(x.note, 'note', 200) || null,
    group: text(x.group, 'group', 40) || null,
    actor: text(actor, 'actor', 40) || 'unknown',
  };
}

export function normalizeMetric(input: unknown, actor: string, now = new Date()): MetricRecord {
  if (!input || typeof input !== 'object') throw new ValidationError('metric object required');
  const x = input as Record<string, unknown>;
  let value: number | string | null = null;
  if (typeof x.value === 'number') value = number(x.value, 'value');
  else if (typeof x.value === 'string') value = text(x.value, 'value', 64);
  else if (x.value !== undefined && x.value !== null) throw new ValidationError('value must be number or string');
  return {
    id: id(x.id, 'id'),
    label: text(x.label, 'label', 80, true),
    value,
    unit: text(x.unit, 'unit', 16) || null,
    updatedAt: (isoTime(x.updatedAt, 'updatedAt') ?? now.toISOString()),
    source: text(x.source, 'source', 120, true),
    link: link(x.link, 'link'),
    note: text(x.note, 'note', 200) || null,
    group: text(x.group, 'group', 40) || null,
    actor: text(actor, 'actor', 40) || 'unknown',
  };
}

export function normalizeEvent(input: unknown, actor: string, now = new Date()): EventRecord {
  if (!input || typeof input !== 'object') throw new ValidationError('event object required');
  const x = input as Record<string, unknown>;
  return {
    at: (isoTime(x.at, 'at') ?? now.toISOString()),
    actor: text(actor, 'actor', 40) || 'unknown',
    kind: oneOf(x.kind, ['info', 'success', 'warning', 'error'] as const, 'kind', 'info'),
    message: text(x.message, 'message', 200, true),
    link: link(x.link, 'link'),
    topic: text(x.topic, 'topic', 40) || null,
  };
}

export function normalizeAgent(input: unknown, actor: string, now = new Date()): AgentRecord {
  if (!input || typeof input !== 'object') throw new ValidationError('agent object required');
  const x = input as Record<string, unknown>;
  return {
    name: id(typeof x.name === 'string' ? x.name.toLowerCase() : x.name, 'name'),
    status: oneOf(x.status, ['running', 'idle', 'blocked', 'offline'] as const, 'status', 'running'),
    currentTask: text(x.currentTask, 'currentTask', 160) || null,
    lastSeenAt: now.toISOString(),
    nextRunAt: isoTime(x.nextRunAt, 'nextRunAt'),
    note: text(x.note, 'note', 160) || (actor ? null : null),
  };
}

// ----------------------------------------------------------------------------- mutations
export interface IngestPayload {
  quotas?: unknown[]; kpis?: unknown[]; metrics?: unknown[]; events?: unknown[]; agents?: unknown[];
}
export interface IngestSummary { quotas: string[]; kpis: string[]; metrics: string[]; events: number; agents: string[] }

export function applyIngest(state: ControlState, payload: IngestPayload, actor: string, now = new Date()): IngestSummary {
  const summary: IngestSummary = { quotas: [], kpis: [], metrics: [], events: 0, agents: [] };
  const list = (v: unknown, name: string) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 50) throw new ValidationError(`${name} must be an array of at most 50 items`);
    return v;
  };
  for (const q of list(payload.quotas, 'quotas')) {
    const record = normalizeQuota(q, actor, now);
    const existing = state.quotas[record.provider];
    // Never let an older observation overwrite a newer one (two collectors may race).
    if (existing && Date.parse(existing.observedAt) > Date.parse(record.observedAt)) continue;
    state.quotas[record.provider] = record;
    summary.quotas.push(record.provider);
  }
  for (const k of list(payload.kpis, 'kpis')) {
    const record = normalizeKpi(k, actor, now);
    state.kpis[record.id] = record;
    summary.kpis.push(record.id);
  }
  for (const m of list(payload.metrics, 'metrics')) {
    const record = normalizeMetric(m, actor, now);
    state.metrics[record.id] = record;
    summary.metrics.push(record.id);
  }
  for (const a of list(payload.agents, 'agents')) {
    const record = normalizeAgent(a, actor, now);
    state.agents[record.name] = record;
    summary.agents.push(record.name);
  }
  const events = list(payload.events, 'events').map((e) => normalizeEvent(e, actor, now));
  if (events.length) {
    state.events = [...events, ...state.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, EVENT_LIMIT);
    summary.events = events.length;
  }
  if (Object.keys(state.kpis).length > 200 || Object.keys(state.metrics).length > 400) {
    throw new ValidationError('state size limit reached');
  }
  return summary;
}

// ----------------------------------------------------------------------------- read model
export type Freshness = 'fresh' | 'stale' | 'missing';
export interface QuotaView extends QuotaRecord { freshness: Freshness; ageMinutes: number | null; primary: QuotaWindow | null }

export function quotaFreshness(record: QuotaRecord | undefined, now = Date.now()): { freshness: Freshness; ageMinutes: number | null } {
  if (!record) return { freshness: 'missing', ageMinutes: null };
  const observed = Date.parse(record.observedAt);
  if (!Number.isFinite(observed)) return { freshness: 'missing', ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((now - observed) / 60_000));
  // A record older than 7 days is treated as missing: the number says nothing about today.
  if (ageMinutes > 7 * 1440) return { freshness: 'missing', ageMinutes };
  return { freshness: ageMinutes > record.staleAfterMinutes ? 'stale' : 'fresh', ageMinutes };
}

export function primaryWindow(record: QuotaRecord): QuotaWindow | null {
  const order: QuotaWindow['kind'][] = ['weekly', 'monthly', 'five_hour', 'model', 'additional', 'other'];
  for (const kind of order) {
    const found = record.windows.find((w) => w.kind === kind && w.remainingPercent !== null);
    if (found) return found;
  }
  return record.windows[0] ?? null;
}

/**
 * `full=false` (anonymous): quotas and agent heartbeats only — percentages and status words.
 * `full=true` (authenticated owner/agent): also KPIs, metrics and the event feed, which may
 * reference revenue figures or task names and therefore stay behind the token.
 */
export function snapshot(state: ControlState, now = Date.now(), full = false) {
  const quotas: QuotaView[] = PROVIDERS.filter((p) => p !== 'chatgpt' || state.quotas.chatgpt).map((provider) => {
    const record = state.quotas[provider] ?? {
      provider, label: PROVIDER_LABEL[provider], windows: [], observedAt: '', updatedAt: '', source: '',
      quality: 'measured' as const, staleAfterMinutes: 180, actor: '', note: null,
    };
    const { freshness, ageMinutes } = quotaFreshness(state.quotas[provider], now);
    return { ...record, freshness, ageMinutes, primary: state.quotas[provider] ? primaryWindow(record) : null };
  });
  const byTime = <T extends { updatedAt: string }>(a: T, b: T) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  return {
    ok: true,
    version: 1,
    generatedAt: new Date(now).toISOString(),
    updatedAt: state.updatedAt,
    quotas,
    agents: Object.values(state.agents).sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .map((a) => full ? a : { name: a.name, status: a.status, lastSeenAt: a.lastSeenAt, nextRunAt: a.nextRunAt ?? null, currentTask: null, note: null }),
    kpis: full ? Object.values(state.kpis).sort(byTime) : [],
    // SNS follower/post-date metrics mirror what the public profiles already show; everything else stays private.
    metrics: Object.values(state.metrics).filter((m) => full || m.group === 'sns').sort(byTime),
    events: full ? state.events.slice(0, 60) : [],
    scope: full ? 'authenticated_control_state' : 'public_quota_and_heartbeat_only',
    authenticated: full,
  };
}
