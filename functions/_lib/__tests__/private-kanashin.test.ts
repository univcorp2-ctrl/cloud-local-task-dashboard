import { describe, expect, it, vi } from 'vitest';
import { onRequestGet } from '../../api/private-kanashin';
const token = 'test-owner-token-at-least-24-characters';
const agent = 'test-agent-token-at-least-24-characters';
const run = async (header = '', cookie = '') => {
  const get = vi.fn(async () => '<html>test</html>');
  const request = new Request('https://example.test/api/private-kanashin', {
    headers: { Authorization: header, Cookie: cookie }
  });
  const response = await onRequestGet({ request, env: {
    TCC_ACCESS_TOKEN: token, TCC_AGENT_TOKEN: agent, TCC_STATE: { get },
  }} as unknown as Parameters<typeof onRequestGet>[0]);
  return { response, get };
};
describe('private report access', () => {
  it('does not fetch private data without valid owner auth', async () => {
    for (const [header, status] of [['', 401], ['Bearer invalid',403], ['Bearer '+agent,403]] as const) {
      const { response, get } = await run(header);
      expect(response.status).toBe(status);
      expect(get).not.toHaveBeenCalled();
    }
  });
  it('allows the owner cookie and sets no-store', async () => {
    const { response, get } = await run('', 'tcc_owner='+token);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>test</html>');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
