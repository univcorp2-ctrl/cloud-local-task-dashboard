/**
 * Client access to the live control-center state (`/api/state`) and the owner token.
 * The token is stored only in this browser's localStorage. `?key=<token>` in the URL is
 * consumed once (saved, then removed from the address bar) so a private link can connect a phone.
 */
import { useCallback, useEffect, useState } from 'react';

export const TOKEN_KEY = 'tcc-access-token-v1';

export type Freshness = 'fresh' | 'stale' | 'missing';
export interface QuotaWindow {
  kind: 'five_hour' | 'weekly' | 'monthly' | 'model' | 'additional' | 'other';
  label: string; remainingPercent: number | null; usedPercent: number | null;
  resetsAt: string | null; remainingText?: string | null; note?: string | null;
}
export interface QuotaView {
  provider: 'claude' | 'codex' | 'antigravity' | 'muse' | 'chatgpt'; label: string; windows: QuotaWindow[];
  observedAt: string; source: string; quality: 'measured' | 'estimated' | 'self_reported'; staleAfterMinutes: number;
  note?: string | null; freshness: Freshness; ageMinutes: number | null; primary: QuotaWindow | null;
}
export interface Kpi { id: string; label: string; unit: string; target: number | null; actual: number | null; period: string | null;
  direction: 'up' | 'down'; updatedAt: string; source: string; link?: string | null; note?: string | null; group?: string | null }
export interface Metric { id: string; label: string; value: number | string | null; unit?: string | null; updatedAt: string; source: string; link?: string | null; note?: string | null; group?: string | null }
export interface AgentBeat { name: string; status: 'running' | 'idle' | 'blocked' | 'offline'; currentTask?: string | null; lastSeenAt: string; nextRunAt?: string | null; note?: string | null }
export interface EventItem { at: string; actor: string; kind: 'info' | 'success' | 'warning' | 'error'; message: string; link?: string | null; topic?: string | null }
export interface UsageItem { key: string; label: string; kind: string; tokens: number | null; sharePercent: number | null; quotaPercent: number | null; runs: number | null; lastAt: string | null; note?: string | null; quality?: 'measured' | 'estimated' | 'self_reported' }
export interface UsageRecord { provider: string; window: string; observedAt: string; source: string; totalTokens: number | null; quotaUsedPercent: number | null; basis: string; items: UsageItem[]; quality?: 'measured' | 'estimated' | 'self_reported' }
export interface JobItem { id: string; name: string; platform: string; schedule: string; scheduleLabel: string | null; enabled: boolean; oneShot: boolean;
  status: 'running' | 'success' | 'failed' | 'paused' | 'scheduled' | 'ended'; lastRunAt: string | null; lastFinishedAt: string | null; nextRunAt: string | null;
  durationSeconds: number | null; model: string | null; runsPerWeek: number | null; category: string | null; note: string | null; link: string | null }
export interface JobsRecord { source: string; label: string; observedAt: string; updatedAt: string; actor: string; items: JobItem[] }
export interface ControlSnapshot {
  usage?: UsageRecord[];
  jobs?: JobsRecord[];
  jobCounts?: { total: number; running: number; failed: number };
  ok: boolean; generatedAt: string; updatedAt: string | null; quotas: QuotaView[]; kpis: Kpi[]; metrics: Metric[];
  agents: AgentBeat[]; events: EventItem[]; authenticated: boolean; scope: string;
}

function readStorage(): string {
  try { return window.localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
export function saveToken(token: string) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token); else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked: the token lives for this page view only */ }
  memoryToken = token;
  listeners.forEach((fn) => fn(token));
}
let memoryToken = '';
let serverConnected = false;
const connListeners = new Set<(v: boolean) => void>();
/** True when this browser can read private data: a stored token OR the server-side owner cookie. */
export function useConnected(): boolean {
  const [token] = useOwnerToken();
  const [server, setServer] = useState(serverConnected);
  useEffect(() => { connListeners.add(setServer); return () => { connListeners.delete(setServer); }; }, []);
  return Boolean(token) || server;
}
const listeners = new Set<(token: string) => void>();

/** Consume `?key=` once, then strip it from the URL. */
export function captureTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('key');
    if (key && key.length >= 24) {
      saveToken(key.trim());
      void fetch('/api/connect?json=1&key=' + encodeURIComponent(key.trim()), { cache: 'no-store', credentials: 'same-origin' }).catch(() => undefined);
      url.searchParams.delete('key');
      window.history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
    }
  } catch { /* ignore malformed URLs */ }
}
/** 「稼ぐ・投資」ページの共有キー（読み取り専用）。`#earn=KEY` のリンクで受け取り、この端末に保存する。 */
const SHARE_STORAGE = 'tcc_earn_share';
export function getShareKey(): string { try { return window.localStorage.getItem(SHARE_STORAGE) || ''; } catch { return ''; } }
export function setShareKey(value: string): void {
  try { if (value) window.localStorage.setItem(SHARE_STORAGE, value); else window.localStorage.removeItem(SHARE_STORAGE); } catch { /* storage unavailable */ }
}
/** `#earn=KEY` で開かれたらキーを保存して、URLからは消す。 */
export function captureShareFromHash(): void {
  try {
    const m = window.location.hash.match(/^#earn=([A-Za-z0-9]{24,64})/);
    if (!m) return;
    setShareKey(m[1]);
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#earn');
  } catch { /* ignore */ }
}

/** 別端末で発行したペアリングコードでこの端末をつなぐ（Cookie 400日）。成功で true。 */
export async function redeemPairCode(code: string): Promise<boolean> {
  try {
    const response = await fetch('/api/pair/redeem', { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    return response.ok;
  } catch { return false; }
}

/** `#pair=CODE` で開かれたら1回だけ使ってURLから消し、成功したら読み直す。 */
export function capturePairFromHash(): void {
  try {
    const m = window.location.hash.match(/^#pair=([A-Za-z0-9-]{6,16})/);
    if (!m) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search + '#overview');
    void redeemPairCode(m[1]).then((ok) => {
      if (ok) window.location.reload();
      else window.alert('ペアリングコードが無効か期限切れです。PCで新しいコードを発行してください。');
    });
  } catch { /* ignore */ }
}

export function getToken(): string { return memoryToken || readStorage(); }
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}
export function useOwnerToken(): [string, (token: string) => void] {
  const [token, setToken] = useState(getToken);
  useEffect(() => { listeners.add(setToken); return () => { listeners.delete(setToken); }; }, []);
  return [token, saveToken];
}

export function useControlState(intervalMs = 60_000) {
  const [data, setData] = useState<ControlSnapshot | null>(null);
  const [error, setError] = useState<string>('');
  const [token] = useOwnerToken();
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/state?t=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
      if (response.status === 401 || response.status === 403) { saveToken(''); serverConnected = false; throw new Error('トークンが無効です。再接続してください'); }
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json() as ControlSnapshot;
      if (!body || !Array.isArray(body.quotas)) throw new Error('invalid state');
      setData(body); setError('');
      if (body.authenticated !== serverConnected) { serverConnected = Boolean(body.authenticated); connListeners.forEach((fn) => fn(serverConnected)); }
    } catch (e) { setError(e instanceof Error ? e.message : '取得できません'); }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    return () => window.clearInterval(id);
  }, [load, intervalMs, token]);
  return { data, error, reload: load };
}

export const toneOf = (value: number | null): 'healthy' | 'warning' | 'critical' | 'unknown' =>
  value === null ? 'unknown' : value < 30 ? 'critical' : value < 50 ? 'warning' : 'healthy';

export function untilReset(when: string | null | undefined, now: number): { text: string; days: number | null } {
  if (!when) return { text: 'リセット日 不明', days: null };
  const reset = Date.parse(when);
  if (!Number.isFinite(reset)) return { text: 'リセット日 不明', days: null };
  const minutes = Math.ceil((reset - now) / 60_000);
  if (minutes <= 0) return { text: 'リセット時刻を過ぎています', days: 0 };
  if (minutes < 60) return { text: `あと${minutes}分でリセット`, days: 0 };
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes - days * 1440) / 60);
  return { text: days ? `あと${days}日${hours ? hours + '時間' : ''}でリセット` : `あと${hours}時間でリセット`, days };
}

export function ageText(minutes: number | null): string {
  if (minutes === null) return '未取得';
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}時間前`;
  return `${Math.floor(minutes / 1440)}日前`;
}

export const fmtJst = (value: string | null | undefined, withTime = true) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(d);
};
