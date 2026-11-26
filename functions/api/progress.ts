/**
 * Owner-only follow-up progress from Cloudflare D1 "hiro-data" (send_log).
 *   GET /api/progress -> { generatedAt, kpi, agents, ballOurs, due, daily }
 * Auth: owner bearer token (TCC_ACCESS_TOKEN) or a verified Cloudflare Access JWT. Fails closed.
 * Read-only: every statement is a SELECT.
 */
import { authorize, jsonResponse, type AuthEnv } from '../_lib/auth';

interface Env extends AuthEnv { HIRO_DATA?: D1Database }

const SENT = "('sent','form_sent','送信済','初回連絡済','follow_up')";
const REPLY = "('replied','返信あり','docs_received')";
const AGENTS = ['claude', 'muse', 'antigravity', 'codex', 'unknown'];

const sql = {
  kpi: `SELECT
      SUM(CASE WHEN result IN ${SENT} THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN result IN ${REPLY} THEN 1 ELSE 0 END) AS replies,
      SUM(CASE WHEN result = 'docs_received' THEN 1 ELSE 0 END) AS docs,
      SUM(CASE WHEN result = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN result IN ${SENT} AND (ai IS NULL OR ai = 'unknown') THEN 1 ELSE 0 END) AS sentUnknownActor
    FROM send_log WHERE substr(event_at,1,10) >= date('now','+9 hours','-7 day')`,
  agents: `SELECT COALESCE(NULLIF(lower(ai),''),'unknown') AS ai,
      SUM(CASE WHEN result IN ${SENT} THEN 1 ELSE 0 END) AS sent7,
      COUNT(*) AS rows7,
      MAX(event_at) AS lastAt
    FROM send_log WHERE substr(event_at,1,10) >= date('now','+9 hours','-7 day')
    GROUP BY 1`,
  agentsAllTime: `SELECT COALESCE(NULLIF(lower(ai),''),'unknown') AS ai, MAX(event_at) AS lastAt FROM send_log GROUP BY 1`,
  ballOurs: `SELECT r.counterpart, MAX(r.event_at) AS lastReply, MAX(r.thread_ref) AS thread, MAX(r.result) AS result
    FROM send_log r
    WHERE r.result IN ${REPLY} AND r.counterpart IS NOT NULL AND r.counterpart <> ''
      AND substr(r.event_at,1,10) >= date('now','+9 hours','-14 day')
    GROUP BY r.counterpart
    HAVING MAX(r.event_at) > COALESCE((SELECT MAX(o.event_at) FROM send_log o
      WHERE o.counterpart = r.counterpart AND o.direction = 'out'), '')
    ORDER BY lastReply DESC LIMIT 40`,
  due: `SELECT d.counterpart, MIN(d.next_follow) AS nextFollow, MAX(d.thread_ref) AS thread
    FROM send_log d
    WHERE d.next_follow IS NOT NULL AND d.next_follow <> '' AND d.counterpart IS NOT NULL AND d.counterpart <> ''
      AND substr(d.next_follow,1,10) <= date('now','+9 hours')
      AND NOT EXISTS (SELECT 1 FROM send_log o WHERE o.counterpart = d.counterpart AND o.direction = 'out'
        AND substr(o.event_at,1,10) >= substr(d.next_follow,1,10))
    GROUP BY d.counterpart ORDER BY nextFollow ASC LIMIT 40`,
  daily: `SELECT substr(event_at,1,10) AS day,
      SUM(CASE WHEN result IN ${SENT} THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN result IN ${REPLY} THEN 1 ELSE 0 END) AS replies
    FROM send_log WHERE substr(event_at,1,10) >= date('now','+9 hours','-13 day')
    GROUP BY 1 ORDER BY 1`,
};

type Row = Record<string, unknown>;
const rows = async (db: D1Database, q: string): Promise<Row[]> => (await db.prepare(q).all<Row>()).results ?? [];

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await authorize(request, env);
  if (!auth.ok) return jsonResponse({ error: auth.status === 503 ? 'auth_not_configured' : auth.error }, auth.status);
  if (auth.actor !== 'owner') return jsonResponse({ error: 'owner_token_required' }, 403);
  const db = env.HIRO_DATA;
  if (!db) return jsonResponse({ error: 'd1_not_bound' }, 503);
  try {
    const [kpi, agents, allTime, ballOurs, due, daily] = await Promise.all([
      rows(db, sql.kpi), rows(db, sql.agents), rows(db, sql.agentsAllTime), rows(db, sql.ballOurs), rows(db, sql.due), rows(db, sql.daily),
    ]);
    const last = new Map(allTime.map((r) => [String(r.ai), String(r.lastAt ?? '')]));
    const by = new Map(agents.map((r) => [String(r.ai), r]));
    const names = Array.from(new Set([...AGENTS, ...agents.map((r) => String(r.ai))]));
    const agentRows = names.map((ai) => ({
      ai,
      sent7: Number(by.get(ai)?.sent7 ?? 0),
      rows7: Number(by.get(ai)?.rows7 ?? 0),
      lastAt: last.get(ai) || null,
    }));
    return jsonResponse({ generatedAt: new Date().toISOString(), kpi: kpi[0] ?? {}, agents: agentRows, ballOurs, due, daily });
  } catch {
    return jsonResponse({ error: 'd1_query_failed' }, 502);
  }
};
