import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../_lib/auth', () => ({
  authorize: vi.fn(async () => ({ ok: true, actor: 'owner', via: 'owner-token' })),
  jsonResponse: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  recordOwnerSeen: vi.fn(async () => undefined),
}));
vi.mock('../_lib/notify', () => ({ notify: vi.fn(async () => true) }));

import { onRequestGet, onRequestPatch, PROPERTY_SOURCE } from './private-deals';
import { PROPERTY_DUPLICATE_MARKER } from '../_lib/property-deal-guard';

const PAGE_ID = '12345678-1234-1234-1234-123456789abc';
const ENV = {
  NOTION_API_TOKEN: 'test-token',
  NOTION_DATA_SOURCE_ID: '6f4841cf-e44c-466c-b330-c0d6daccb974',
  NOTION_PROPERTY_DATA_SOURCE_ID: PROPERTY_SOURCE,
};

function makePage(id = PAGE_ID, overrides: Record<string, unknown> = {}) {
  return {
    id,
    url: 'https://www.notion.so/' + id,
    last_edited_time: '2026-11-27T01:00:00.000Z',
    parent: { data_source_id: PROPERTY_SOURCE },
    properties: {
      '物件名': { title: [{ plain_text: 'テスト戸建' }] },
      'パイプライン段階': { select: { name: '資料受領' } },
      'ステータス': { select: { name: '候補継続' } },
      '販売確認': { select: { name: '販売中' } },
      '次の一手': { rich_text: [{ plain_text: '接道資料を確認' }] },
      '次の一手の期限': { date: { start: '2026-11-30' } },
      'Hiro→AI指示': { rich_text: [] },
      ...overrides,
    },
  };
}

function context(request: Request) {
  return { request, env: ENV, params: {}, waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as Parameters<typeof onRequestGet>[0];
}

function installFetch(target: ReturnType<typeof makePage>, bodyBlocks: unknown[] = [], queryPages?: unknown[]) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    if (url.includes('/v1/data_sources/')) {
      return new Response(JSON.stringify({ results: queryPages ?? [], has_more: false }), { status: 200 });
    }
    if (url.includes('/v1/pages/')) {
      if (method === 'PATCH') return new Response(JSON.stringify({ id: target.id }), { status: 200 });
      return new Response(JSON.stringify(target), { status: 200 });
    }
    if (url.includes('/v1/blocks/') && url.includes('/children')) {
      if (method === 'PATCH') return new Response(JSON.stringify({ results: [] }), { status: 200 });
      return new Response(JSON.stringify({ results: bodyBlocks, has_more: false }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('https://tcc.test/api/private-deals', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: PAGE_ID, expectNextAction: '接道資料を確認', expectStage: '資料受領', expectDue: '2026-11-30', expectUpdatedAt: '2026-11-27T01:00:00.000Z', nextAction: '行政へ道路確認', ...body }),
  });
}

describe('private-deals API guard integration', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('GET excludes duplicates, stopped rows and rows without next action or deadline', async () => {
    const valid = makePage('11111111-1111-1111-1111-111111111111');
    const duplicate = makePage('22222222-2222-2222-2222-222222222222', {
      '次の一手': { rich_text: [{ plain_text: '重複統合済。正本へ集約済' }] },
    });
    const noDue = makePage('33333333-3333-3333-3333-333333333333', { '次の一手の期限': { date: null } });
    const noAction = makePage('44444444-4444-4444-4444-444444444444', { '次の一手': { rich_text: [] } });
    const stopped = makePage('55555555-5555-5555-5555-555555555555', { 'ステータス': { select: { name: '見送り' } } });
    const ended = makePage('66666666-6666-6666-6666-666666666666', { '販売確認': { select: { name: '掲載終了' } } });
    installFetch(valid, [], [valid, duplicate, noDue, noAction, stopped, ended]);
    const response = await onRequestGet(context(new Request('https://tcc.test/api/private-deals')));
    const data = await response.json() as { deals: Array<{ id: string }> };
    expect(response.status).toBe(200);
    expect(data.deals.map((d) => d.id)).toEqual([valid.id]);
  });

  it('PATCH refuses a page-body duplicate marker even if stage and next action look active', async () => {
    const target = makePage();
    const { calls } = installFetch(target, [{ type: 'heading_2', heading_2: { rich_text: [{ plain_text: PROPERTY_DUPLICATE_MARKER }] } }]);
    const response = await onRequestPatch(context(patchRequest({})));
    const data = await response.json() as { error: string };
    expect(response.status).toBe(409);
    expect(data.error).toBe('duplicate_locked');
    expect(calls.filter((c) => c.url.includes('/v1/pages/') && c.method === 'PATCH')).toHaveLength(0);
  });

  it('PATCH refuses an owner hold or external wait before writing', async () => {
    const target = makePage(PAGE_ID, { 'Hiro→AI指示': { rich_text: [{ plain_text: 'HOLD：外部回答待ち' }] } });
    const { calls } = installFetch(target);
    const response = await onRequestPatch(context(patchRequest({})));
    const data = await response.json() as { error: string };
    expect(response.status).toBe(409);
    expect(data.error).toBe('owner_or_external_hold');
    expect(calls.filter((c) => c.url.includes('/v1/pages/') && c.method === 'PATCH')).toHaveLength(0);
  });

  it('PATCH writes an active row only after the fresh read and body guard pass', async () => {
    const target = makePage();
    const { calls } = installFetch(target);
    const response = await onRequestPatch(context(patchRequest({})));
    const data = await response.json() as { ok: boolean };
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(calls.filter((c) => c.url.includes('/v1/pages/') && c.method === 'PATCH')).toHaveLength(1);
  });

  it('PATCH rejects a stale last-edited snapshot before writing', async () => {
    const target = makePage();
    const { calls } = installFetch(target);
    const response = await onRequestPatch(context(patchRequest({ expectUpdatedAt: '2026-11-26T00:00:00.000Z' })));
    const data = await response.json() as { error: string };
    expect(response.status).toBe(409);
    expect(data.error).toBe('row_changed_reload');
    expect(calls.filter((c) => c.url.includes('/v1/pages/') && c.method === 'PATCH')).toHaveLength(0);
  });

  it('PATCH rejects stale stage and due snapshots before writing', async () => {
    const target = makePage();
    const { calls } = installFetch(target);
    const response = await onRequestPatch(context(patchRequest({ expectStage: '資料請求済' })));
    const data = await response.json() as { error: string };
    expect(response.status).toBe(409);
    expect(data.error).toBe('row_changed_reload');
    expect(calls.filter((c) => c.url.includes('/v1/pages/') && c.method === 'PATCH')).toHaveLength(0);
  });

  it('PATCH does not permit clearing the deadline while a deal remains active', async () => {
    const { calls } = installFetch(makePage());
    const response = await onRequestPatch(context(patchRequest({ due: null })));
    const data = await response.json() as { error: string };
    expect(response.status).toBe(400);
    expect(data.error).toBe('deal_due_required');
    expect(calls).toHaveLength(0);
  });
});
