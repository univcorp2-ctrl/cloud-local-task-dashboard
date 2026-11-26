import { describe, expect, it } from 'vitest';
import { lamp } from '../execution';
import { onRequestGet } from '../../api/private-execution';

describe('execution lamps', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  it('turns red at 24h and for missing or future observations', () => {
    expect(lamp('2026-11-25T12:00:00Z', 'success', now)).toBe('red');
    expect(lamp('2026-11-25T12:00:01Z', 'success', now)).toBe('green');
    expect(lamp(null, null, now)).toBe('red');
    expect(lamp('2026-11-27T12:00:00Z', 'success', now)).toBe('red');
    expect(lamp('invalid', 'success', now)).toBe('red');
    expect(lamp('2026-11-26T11:00:00Z', 'failed', now)).toBe('red');
    expect(lamp('2026-11-26T11:00:00Z', 'partial', now)).toBe('yellow');
  });
});

describe('private execution endpoint', () => {
  const owner = 'owner-secret-is-at-least-24-chars';
  const agent = 'agent-secret-is-at-least-24-chars';
  async function call(token?: string, db?: unknown) {
    return onRequestGet({request:new Request('https://example.org/api/private-execution', {headers:token?{Authorization:'Bearer '+token}:{}}),env:{TCC_ACCESS_TOKEN:owner,TCC_AGENT_TOKEN:agent,HIRO_DATA:db}} as never);
  }
  it('rejects anonymous and agent reads before touching D1', async () => {
    expect((await call()).status).toBe(401);
    expect((await call(agent)).status).toBe(403);
    expect((await call(owner)).status).toBe(503);
  });
  it('reports failed storage as unavailable, never an empty success', async () => {
    const db={prepare:()=>({all:async()=>{throw new Error('private sql detail')}})};
    const response=await call(owner,db);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private sql detail');
  });
  it('returns run evidence, missing source status and total pending count privately', async () => {
    const db={prepare:(sql:string)=>({all:async()=>({success:true,results:sql.includes('COUNT(*)')?[{total:250}]:sql.includes('inbox_sources')?[{account:'bukken511',status:'error'}]:[]})})};
    const response=await call(owner,db);
    const body=await response.json() as {pendingTotal:number;pendingTruncated:boolean;agents:unknown[];sources:unknown[]};
    expect(body.pendingTotal).toBe(250);expect(body.pendingTruncated).toBe(true);
    expect(body.agents).toHaveLength(5);expect(body.sources).toHaveLength(1);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });
});
