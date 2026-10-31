/**
 * Minimal MCP server (Streamable HTTP, JSON responses) for other AI agents.
 * Transport: POST /api/mcp with a JSON-RPC 2.0 message, `Authorization: Bearer <token>`.
 * Tools write to the shared control state; Notion task tools require the owner token.
 */
import type { KVLike } from './kv';
import type { Actor } from './auth';
import { applyIngest, loadState, saveState, snapshot, ValidationError } from './state';
import { completeTask, listTasks, NotionError, type NotionEnv } from './notion';

export const MCP_PROTOCOL = '2025-03-26';
export const SERVER_INFO = { name: 'task-control-center', version: '2.0.0' };

interface JsonRpcRequest { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
export interface McpContext { kv: KVLike; actor: Actor; actorName: string; notionEnv: NotionEnv; now?: () => Date }

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: true });
const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: ['number', 'null'], description });

export const TOOLS = [
  { name: 'get_state', description: 'Read the current control-center state: AI quotas (remaining %, reset time, freshness), KPIs, metrics, agent heartbeats and recent events.', inputSchema: obj({}) },
  { name: 'set_quota', description: 'Report an AI provider usage quota. provider: claude|codex|antigravity|muse|chatgpt. windows: [{kind: weekly|five_hour|monthly|model|additional|other, label, remainingPercent or usedPercent, resetsAt ISO, remainingText?}]. observedAt ISO is the time the number was read; never guess percentages.',
    inputSchema: obj({ provider: str('claude|codex|antigravity|muse|chatgpt'), windows: { type: 'array', items: obj({ kind: str('weekly|five_hour|monthly|model|additional|other'), label: str('short label'), remainingPercent: num('0..100'), usedPercent: num('0..100'), resetsAt: str('ISO-8601 reset time'), remainingText: str('e.g. 7.8B') }) }, observedAt: str('ISO-8601 observation time'), source: str('where the number came from'), quality: str('measured|estimated|self_reported'), staleAfterMinutes: num('minutes until this reading counts as stale'), note: str('optional note') }, ['provider', 'windows', 'observedAt', 'source']) },
  { name: 'set_usage', description: 'Report which tasks consumed a provider\'s quota/tokens in a window. items: [{key,label,kind: scheduled|cli|app|surface|subagent|worker|other, tokens?, sharePercent?, quotaPercent?, runs?, lastAt?}]. Use measured numbers only.',
    inputSchema: obj({ provider: str('claude|codex|antigravity|muse|chatgpt'), window: str('e.g. 7d'), observedAt: str('ISO-8601'), source: str('data source'), totalTokens: num('total tokens in window'), quotaUsedPercent: num('provider quota used %'), basis: str('tokens|percent'), items: { type: 'array', items: obj({}) } }, ['provider', 'observedAt', 'source', 'items']) },
  { name: 'set_kpi', description: 'Upsert a KPI/KGI with target and actual (e.g. id=earn-lab-monthly-revenue, unit=JPY, target=5000000, actual=120000, period=2026-11).',
    inputSchema: obj({ id: str('kebab-case id'), label: str('display label'), unit: str('JPY|%|件|...'), target: num('target value'), actual: num('actual value'), period: str('e.g. 2026-11 or 2026-W45'), direction: str('up|down (which way is good)'), source: str('data source'), link: str('https link to evidence'), note: str('short note'), group: str('earn-lab|sns|real-estate|dev|...') }, ['id', 'label', 'source']) },
  { name: 'set_metric', description: 'Upsert a simple metric value (number or short string) shown on the dashboard.',
    inputSchema: obj({ id: str('kebab-case id'), label: str('display label'), value: { description: 'number or short string' }, unit: str('unit'), source: str('data source'), link: str('https link'), note: str('short note'), group: str('group id') }, ['id', 'label', 'source']) },
  { name: 'log_event', description: 'Append a short public-safe event to the activity feed (what an agent did, succeeded or failed). No secrets, e-mails or personal data.',
    inputSchema: obj({ message: str('<=200 chars'), kind: str('info|success|warning|error'), link: str('https link'), topic: str('topic id') }, ['message']) },
  { name: 'agent_heartbeat', description: 'Report that an agent is alive and what it is working on. name: codex|antigravity|muse|claude|<other id>.',
    inputSchema: obj({ name: str('agent id'), status: str('running|idle|blocked|offline'), currentTask: str('what it is doing now'), nextRunAt: str('ISO-8601 next scheduled run'), note: str('short note') }, ['name']) },
  { name: 'list_private_tasks', description: 'Owner only. List open Notion master tasks (title, category, priority, owner/human vs AI, next action, due).', inputSchema: obj({ showCompleted: { type: 'boolean' } }) },
  { name: 'complete_private_task', description: 'Owner only. Mark a Notion master task complete by page id; appends an audit line on the page.', inputSchema: obj({ id: str('Notion page id') }, ['id']) },
] as const;

export function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}
const rpcResult = (id: JsonRpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
const toolText = (payload: unknown, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }], isError });

export async function callTool(ctx: McpContext, name: string, args: Record<string, unknown>) {
  const now = ctx.now ? ctx.now() : new Date();
  const write = async (payload: Parameters<typeof applyIngest>[1]) => {
    const state = await loadState(ctx.kv);
    const summary = applyIngest(state, payload, ctx.actorName, now);
    await saveState(ctx.kv, state);
    return summary;
  };
  try {
    switch (name) {
      case 'get_state': return toolText(snapshot(await loadState(ctx.kv), now.getTime(), true));
      case 'set_quota': return toolText({ ok: true, ...(await write({ quotas: [args] })) });
      case 'set_usage': return toolText({ ok: true, ...(await write({ usage: [args] })) });
      case 'set_kpi': return toolText({ ok: true, ...(await write({ kpis: [args] })) });
      case 'set_metric': return toolText({ ok: true, ...(await write({ metrics: [args] })) });
      case 'log_event': return toolText({ ok: true, ...(await write({ events: [args] })) });
      case 'agent_heartbeat': return toolText({ ok: true, ...(await write({ agents: [args] })) });
      case 'list_private_tasks':
        if (ctx.actor !== 'owner') return toolText({ error: 'owner_token_required' }, true);
        return toolText(await listTasks(ctx.notionEnv, args.showCompleted === true));
      case 'complete_private_task': {
        if (ctx.actor !== 'owner') return toolText({ error: 'owner_token_required' }, true);
        const result = await completeTask(ctx.notionEnv, String(args.id ?? ''), `mcp:${ctx.actorName}`);
        await write({ events: [{ kind: 'success', message: `Notionタスクを完了にしました (${String(args.id).slice(0, 8)}…)`, topic: 'tasks' }] });
        return toolText(result);
      }
      default: return toolText({ error: `unknown tool ${name}` }, true);
    }
  } catch (error) {
    if (error instanceof ValidationError) return toolText({ error: 'validation', message: error.message }, true);
    if (error instanceof NotionError) return toolText({ error: error.code, status: error.status }, true);
    return toolText({ error: 'internal', message: 'tool failed' }, true);
  }
}

/** Handle one JSON-RPC message (or a batch). Returns null for notifications. */
export async function handleRpc(ctx: McpContext, message: unknown): Promise<unknown | null> {
  if (Array.isArray(message)) {
    const replies = (await Promise.all(message.map((m) => handleRpc(ctx, m)))).filter((r) => r !== null);
    return replies.length ? replies : null;
  }
  if (!message || typeof message !== 'object') return rpcError(null, -32600, 'invalid request');
  const req = message as JsonRpcRequest;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcError(req.id, -32600, 'invalid request');
  const isNotification = req.id === undefined;
  switch (req.method) {
    case 'initialize':
      return rpcResult(req.id, { protocolVersion: MCP_PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO,
        instructions: 'Task Control Center state server. Use set_quota/set_kpi/set_metric/log_event/agent_heartbeat to publish numbers; values must be observed, never estimated silently (mark quality=estimated).' });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return isNotification ? null : rpcResult(req.id, {});
    case 'tools/list':
      return rpcResult(req.id, { tools: TOOLS });
    case 'tools/call': {
      const name = typeof req.params?.name === 'string' ? req.params.name : '';
      const args = (req.params?.arguments && typeof req.params.arguments === 'object') ? req.params.arguments as Record<string, unknown> : {};
      if (!TOOLS.some((t) => t.name === name)) return rpcError(req.id, -32602, `unknown tool: ${name}`);
      return rpcResult(req.id, await callTool(ctx, name, args));
    }
    case 'resources/list': return rpcResult(req.id, { resources: [] });
    case 'prompts/list': return rpcResult(req.id, { prompts: [] });
    default:
      return isNotification ? null : rpcError(req.id, -32601, `method not found: ${req.method}`);
  }
}
