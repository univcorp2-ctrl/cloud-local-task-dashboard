import { describe, expect, it } from 'vitest';
import { MemoryKV } from '../kv';
import { handleRpc, TOOLS } from '../mcp';

const ctx = (actor: 'owner' | 'agent') => ({ kv: new MemoryKV(), actor, actorName: 'codex', notionEnv: {}, now: () => new Date('2026-10-31T00:00:00+09:00') });

describe('mcp server', () => {
  it('initializes, lists tools and writes a quota through tools/call', async () => {
    const c = ctx('agent');
    const init = await handleRpc(c, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe('task-control-center');
    expect(await handleRpc(c, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const list = await handleRpc(c, { jsonrpc: '2.0', id: 2, method: 'tools/list' }) as { result: { tools: unknown[] } };
    expect(list.result.tools).toHaveLength(TOOLS.length);
    const call = await handleRpc(c, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'set_quota', arguments: {
      provider: 'codex', windows: [{ kind: 'weekly', label: '7日枠', usedPercent: 8, resetsAt: '2026-11-04T08:01:19Z' }], observedAt: '2026-10-30T23:00:00+09:00', source: 'codex cli' } } }) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(call.result.isError).toBe(false);
    const state = await handleRpc(c, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_state' } }) as { result: { content: Array<{ text: string }> } };
    expect(JSON.parse(state.result.content[0].text).quotas.find((q: { provider: string }) => q.provider === 'codex').primary.remainingPercent).toBe(92);
  });
  it('refuses Notion tools for agent tokens and reports validation errors as tool errors', async () => {
    const c = ctx('agent');
    const denied = await handleRpc(c, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_private_tasks' } }) as { result: { isError: boolean } };
    expect(denied.result.isError).toBe(true);
    const bad = await handleRpc(c, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'set_kpi', arguments: { id: 'Bad Id', label: 'x', source: 's' } } }) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toContain('validation');
    const unknown = await handleRpc(c, { jsonrpc: '2.0', id: 7, method: 'nope' }) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
  });
});
