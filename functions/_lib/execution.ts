export const executionAis = ['claude', 'codex', 'antigravity', 'muse', 'chatgpt'] as const;
export function lamp(at: string | null, status: string | null, now = Date.now()): 'red' | 'yellow' | 'green' {
  const age = at ? now - Date.parse(at) : NaN;
  if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000 || status === 'failed' || status === 'blocked' || status === 'uncertain') return 'red';
  return status === 'success' ? 'green' : 'yellow';
}
export interface ExecutionDatabase {
  prepare(sql: string): { all<T>(): Promise<{ success: boolean; results: T[] }> };
}
