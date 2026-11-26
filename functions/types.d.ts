/* Minimal Cloudflare Pages Functions typings so `tsc` can check functions/ without the workers-types package. */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}
interface EventContext<Env, Params extends string = string, Data = Record<string, unknown>> {
  request: Request;
  env: Env;
  params: Record<Params, string>;
  data: Data;
  waitUntil(promise: Promise<unknown>): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
}
type PagesFunction<Env = unknown, Params extends string = string> = (context: EventContext<Env, Params>) => Response | Promise<Response>;
interface D1Result<T> { results?: T[]; success: boolean }
interface D1PreparedStatement { bind(...values: unknown[]): D1PreparedStatement; all<T = Record<string, unknown>>(): Promise<D1Result<T>> }
interface D1Database { prepare(query: string): D1PreparedStatement }
