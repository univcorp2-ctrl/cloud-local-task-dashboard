/**
 * MCP endpoint (Streamable HTTP, JSON responses) at POST /api/mcp.
 * Connect from Codex / Claude Code / Antigravity / Muse with:
 *   url: https://cloud-local-task-dashboard.pages.dev/api/mcp
 *   headers: { "Authorization": "Bearer <TCC_AGENT_TOKEN or TCC_ACCESS_TOKEN>" }
 */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';
import { handleRpc, rpcError, SERVER_INFO, TOOLS } from '../_lib/mcp';
import type { NotionEnv } from '../_lib/notion';

interface Env extends AuthEnv, NotionEnv { TCC_STATE?: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async () =>
  jsonResponse({ ok: true, server: SERVER_INFO, transport: 'streamable-http (POST JSON-RPC 2.0)', tools: TOOLS.map((t) => t.name),
    auth: 'Authorization: Bearer <token>', note: 'SSE streams are not offered; every request receives one JSON response.' }, 200, { Allow: 'GET, POST' });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.TCC_STATE) return jsonResponse(rpcError(null, -32000, 'state store not bound'), 503);
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse(rpcError(null, -32001, auth.error), auth.status, { 'WWW-Authenticate': 'Bearer' });
  const raw = await request.text();
  if (raw.length > 200_000) return jsonResponse(rpcError(null, -32600, 'body too large'), 413);
  let message: unknown;
  try { message = JSON.parse(raw); } catch { return jsonResponse(rpcError(null, -32700, 'parse error'), 400); }
  const actorName = (request.headers.get('X-TCC-Agent') || '').replace(/[^a-z0-9_.-]/gi, '').slice(0, 40) || auth.actor;
  const reply = await handleRpc({ kv: env.TCC_STATE, actor: auth.actor, actorName, notionEnv: env }, message);
  if (reply === null) return new Response(null, { status: 202 });
  return jsonResponse(reply);
};

export const onRequestDelete: PagesFunction<Env> = async () => new Response(null, { status: 204 });
