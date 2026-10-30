/**
 * Authentication for private endpoints.
 *
 * Two independent paths, either is sufficient:
 *  1. Bearer token: `Authorization: Bearer <TCC_ACCESS_TOKEN>` (owner, browsers and AI agents)
 *     or `<TCC_AGENT_TOKEN>` (AI agents; may only write state, never read Notion tasks).
 *  2. Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) when CF_ACCESS_TEAM_DOMAIN/AUD are set.
 *
 * Tokens are compared in constant time. Nothing here logs or echoes the presented value.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface AuthEnv {
  TCC_ACCESS_TOKEN?: string;
  TCC_AGENT_TOKEN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export type Actor = 'owner' | 'agent';
export type AuthResult =
  | { ok: true; actor: Actor; via: 'bearer' | 'access' }
  | { ok: false; status: number; error: string };

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function bearerOf(request: Request): string {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return (request.headers.get('X-TCC-Token') || '').trim();
}

export function isConfigured(env: AuthEnv): boolean {
  return Boolean(env.TCC_ACCESS_TOKEN?.trim() || env.TCC_AGENT_TOKEN?.trim() || (env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD));
}

export async function authorize(request: Request, env: AuthEnv): Promise<AuthResult> {
  if (!isConfigured(env)) return { ok: false, status: 503, error: 'auth_not_configured' };
  const presented = bearerOf(request);
  if (presented) {
    if (presented.length >= 24 && safeEqual(presented, env.TCC_ACCESS_TOKEN?.trim() || '')) return { ok: true, actor: 'owner', via: 'bearer' };
    if (presented.length >= 24 && safeEqual(presented, env.TCC_AGENT_TOKEN?.trim() || '')) return { ok: true, actor: 'agent', via: 'bearer' };
    return { ok: false, status: 403, error: 'invalid_token' };
  }
  const domain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (domain && audience && assertion) {
    try {
      const issuer = new URL(domain);
      if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com')) {
        return { ok: false, status: 503, error: 'invalid_access_issuer_configuration' };
      }
      await jwtVerify(assertion, createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)),
        { issuer: issuer.origin, audience, algorithms: ['RS256'] });
      return { ok: true, actor: 'owner', via: 'access' };
    } catch {
      return { ok: false, status: 403, error: 'invalid_access_token' };
    }
  }
  return { ok: false, status: 401, error: 'authentication_required' };
}

export const jsonResponse = (data: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
