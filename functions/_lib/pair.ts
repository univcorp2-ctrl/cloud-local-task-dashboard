/** 端末ペアリング（PCで発行したコードでiPhone等をつなぐ）の共通部品。 */
export const PAIR_PREFIX = 'tcc:pair:';
export const PAIR_TTL = 600;
export const PAIR_FAIL_KEY = 'tcc:pair:failures';
export const PAIR_MAX_FAILS = 20;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 紛らわしい 0/O/1/I/L を除外

export function newPairCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const normalizePairCode = (raw: unknown) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
