import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  NOTION_API_TOKEN?: string;
  NOTION_DATA_SOURCE_ID?: string;
}
interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, {
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name: string } | null;
    checkbox?: boolean;
    date?: { start: string } | null;
  }>;
}
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Cf-Access-Jwt-Assertion',
  },
});
const titleOf = (page: NotionPage, name: string) =>
  (page.properties[name]?.title ?? page.properties[name]?.rich_text ?? [])
    .map((part) => part.plain_text ?? '').join('');
const optionOf = (page: NotionPage, name: string) => page.properties[name]?.select?.name ?? '';

/**
 * Fail closed: no private task metadata is sent without a cryptographically
 * verified Cloudflare Access JWT. A bare header is never sufficient.
 * The Cloudflare Access policy must also restrict the approved identities.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!domain || !audience) {
    return json({ error: 'private_tasks_auth_not_configured' }, 503);
  }

  let issuer: URL;
  try {
    issuer = new URL(domain);
    if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com')) {
      return json({ error: 'invalid_access_issuer_configuration' }, 503);
    }
  } catch {
    return json({ error: 'invalid_access_issuer_configuration' }, 503);
  }

  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return json({ error: 'authentication_required' }, 401);

  try {
    await jwtVerify(
      assertion,
      createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)),
      { issuer: issuer.origin, audience, algorithms: ['RS256'] },
    );
  } catch {
    return json({ error: 'invalid_access_token' }, 403);
  }

  // Never expose the Notion integration token to the frontend or logs.
  const token = env.NOTION_API_TOKEN?.trim();
  const dataSourceId = env.NOTION_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId || !/^[a-f0-9-]{32,36}$/i.test(dataSourceId)) {
    return json({ error: 'notion_not_configured' }, 503);
  }

  const pages: NotionPage[] = [];
  let cursor: string | null = null;
  let truncated = false;
  try {
    for (let index = 0; index < 10; index += 1) {
      const body: Record<string, unknown> = {
        page_size: 100,
        filter: { and: [
          { property: '完了', checkbox: { equals: false } },
          { property: 'ステータス', select: { does_not_equal: '✅ 完了' } },
          { property: 'ステータス', select: { does_not_equal: '完了' } },
          { property: 'ステータス', select: { does_not_equal: '🟢 完了' } },
        ] },
      };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) return json({ error: 'notion_query_failed', status: response.status }, 502);
      const data = await response.json() as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };
      pages.push(...(data.results ?? []));
      if (!data.has_more) { cursor = null; break; }
      if (!data.next_cursor) return json({ error: 'notion_cursor_missing' }, 502);
      cursor = data.next_cursor;
    }
    truncated = Boolean(cursor);
  } catch {
    return json({ error: 'notion_unreachable' }, 502);
  }

  const tasks = pages.filter((page) => !page.properties['完了']?.checkbox &&
    !['✅ 完了', '完了', '🟢 完了'].includes(optionOf(page, 'ステータス')))
    .map((page) => ({
      id: page.id,
      url: page.url,
      title: titleOf(page, 'タスク名'),
      category: optionOf(page, '統合カテゴリ') || '🔍 要確認',
      priority: optionOf(page, '優先度') || '未設定',
      status: optionOf(page, 'ステータス') || '未設定',
      owner: optionOf(page, '担当') || '未設定',
      executor: optionOf(page, '実行レーン') || '未設定',
      due: page.properties['期日']?.date?.start ?? null,
      nextAction: titleOf(page, '次の一手'),
      humanAction: titleOf(page, '人間がやること'),
      executionStatus: optionOf(page, '実行状況') || '未設定',
    }));
  return json({ generatedAt: new Date().toISOString(), source: 'Notion', truncated, tasks });
};

/**
 * Only accept an explicit same-origin completion request after verified
 * Cloudflare Access JWT. This endpoint never accepts task title/content.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!domain || !audience) return json({ error: 'private_tasks_auth_not_configured' }, 503);
  let issuer: URL;
  try {
    issuer = new URL(domain);
    if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com')) {
      return json({ error: 'invalid_access_issuer_configuration' }, 503);
    }
  } catch { return json({ error: 'invalid_access_issuer_configuration' }, 503); }
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return json({ error: 'authentication_required' }, 401);
  try {
    await jwtVerify(assertion, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)),
      { issuer: issuer.origin, audience, algorithms: ['RS256'] });
  } catch { return json({ error: 'invalid_access_token' }, 403); }
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) return json({ error: 'same_origin_required' }, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'invalid_content_type' }, 415);
  const token = env.NOTION_API_TOKEN?.trim();
  const dataSourceId = env.NOTION_DATA_SOURCE_ID?.trim();
  if (!token || !dataSourceId) return json({ error: 'notion_not_configured' }, 503);
  let body: { id?: unknown; completed?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'invalid_body' }, 400); }
  if (typeof body.id !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(body.id) || body.completed !== true) {
    return json({ error: 'invalid_completion_request' }, 400);
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2025-09-03',
    'Content-Type': 'application/json',
  };
  try {
    const pageResponse = await fetch(`https://api.notion.com/v1/pages/${body.id}`, { headers });
    if (!pageResponse.ok) return json({ error: 'task_not_found_or_inaccessible' }, 404);
    const page = await pageResponse.json() as { parent?: { type?: string; database_id?: string; data_source_id?: string } };
    const source = page.parent?.data_source_id?.replace(/-/g, '').toLowerCase();
    const expected = dataSourceId.replace(/-/g, '').toLowerCase();
    const database = page.parent?.database_id?.replace(/-/g, '').toLowerCase();
    const allowedDatabase = '5f61a18de1f84eac84ac355126311f8b';
    if (source !== expected && database !== allowedDatabase) return json({ error: 'wrong_task_database' }, 403);
    const response = await fetch(`https://api.notion.com/v1/pages/${body.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ properties: { '完了': { checkbox: true }, 'ステータス': { select: { name: '✅ 完了' } } } }),
    });
    if (!response.ok) return json({ error: 'notion_save_failed', status: response.status }, 502);
    return json({ ok: true, taskId: body.id });
  } catch { return json({ error: 'notion_unreachable' }, 502); }
};
