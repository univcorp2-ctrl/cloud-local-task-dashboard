import { applyIngest, loadState, saveState } from './state';

/** Activity-feed note in KV. Never turns a saved Notion write into an error. */
export async function notify(env: { TCC_STATE?: KVNamespace }, message: string, topic: string, kind: 'info' | 'success' = 'info'): Promise<boolean> {
  if (!env.TCC_STATE) return false;
  try {
    const state = await loadState(env.TCC_STATE);
    applyIngest(state, { events: [{ kind, message, topic }] }, 'owner');
    await saveState(env.TCC_STATE, state);
    return true;
  } catch { return false; }
}
