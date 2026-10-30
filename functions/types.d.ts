/* Minimal Cloudflare Pages Functions typings so `tsc` can check functions/ without the workers-types package. */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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
