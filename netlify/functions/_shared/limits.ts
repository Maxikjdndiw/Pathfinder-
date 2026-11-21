/**
 * Access codes and a simple daily limit per code, to protect the API budget.
 * Codes: env PATHFINDER_ACCESS_CODES (or ACCESS_CODES), comma separated, for example "LENA-4821,PILO-0193".
 * Compared on letters and digits only, so case, spaces, quotes and the dash do not matter.
 * Limit: env PATHFINDER_DAILY_LIMIT messages per code and day (default 60).
 * Counters live in Netlify Blobs; without Blobs (plain local dev) they fall back to memory.
 */
import { getStore } from '@netlify/blobs';

/** Only letters and digits, upper case: "abcd-1234", " ABCD 1234 " and "ABCD1234" all match. */
export const canonical = (code: unknown) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The codes from the environment. PATHFINDER_ACCESS_CODES, or ACCESS_CODES as a fallback name. */
export function accessCodes(): string[] {
  return (process.env.PATHFINDER_ACCESS_CODES || process.env.ACCESS_CODES || '')
    .split(',')
    .map(canonical)
    .filter(Boolean);
}

/** The code as sent (upper case, trimmed); also the key for the daily limit. */
export function normaliseCode(code: unknown): string {
  return String(code ?? '').trim().toUpperCase().slice(0, 64);
}

let warned = false;
export function isValidCode(code: string): boolean {
  const codes = accessCodes();
  if (!codes.length && !warned) {
    warned = true;
    // shows in the terminal of netlify dev and in the function log on Netlify; no code is printed
    console.warn('Pathfinder: keine Zugangscodes gesetzt. Bitte PATHFINDER_ACCESS_CODES in .env oder bei Netlify eintragen.');
  }
  const c = canonical(code);
  return c.length > 0 && codes.includes(c);
}

const memory = new Map<string, number>();

/** Counts one message for this code today. Returns false when the daily limit is reached. */
export async function takeQuota(code: string): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = Math.max(1, Number(process.env.PATHFINDER_DAILY_LIMIT ?? 60) || 60);
  const key = `${code}:${new Date().toISOString().slice(0, 10)}`;
  let used = 0;
  try {
    const store = getStore('pathfinder-usage');
    used = Number((await store.get(key)) ?? 0);
    if (used >= limit) return { ok: false, used, limit };
    await store.set(key, String(used + 1));
  } catch {
    used = memory.get(key) ?? 0;
    if (used >= limit) return { ok: false, used, limit };
    memory.set(key, used + 1);
  }
  return { ok: true, used: used + 1, limit };
}
