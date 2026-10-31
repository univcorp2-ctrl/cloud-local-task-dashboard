/** Minimal KV surface used by the control-center state store (matches Cloudflare KVNamespace). */
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list?(options: { prefix: string }): Promise<{ keys: Array<{ name: string }> }>;
}

/** In-memory KV for tests and local previews. */
export class MemoryKV implements KVLike {
  private store = new Map<string, string>();
  async get(key: string) { return this.store.get(key) ?? null; }
  async put(key: string, value: string) { this.store.set(key, value); }
  async list({ prefix }: { prefix: string }) { return { keys: [...this.store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}
