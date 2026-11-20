/**
 * Access codes and a simple daily limit per code, to protect the API budget.
 * Codes: env PATHFINDER_ACCESS_CODES, comma separated (for example "LENA-4821,PILOT-0193").
 * Limit: env PATHFINDER_DAILY_LIMIT messages per code and day (default 60).
 * Counters live in Netlify Blobs; without Blobs (plain local dev) they fall back to memory.
 */
import { getStore } from '@netlify/blobs';

export function accessCodes(): string[] {
  return (process.env.PATHFINDER_ACCESS_CODES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export function normaliseCode(code: unknown): string {
  return String(code ?? '').trim().toUpperCase().slice(0, 64);
}

export function isValidCode(code: string): boolean {
  return code.length > 0 && accessCodes().includes(code);
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
