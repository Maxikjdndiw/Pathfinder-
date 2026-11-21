/**
 * Small JSON key value store on Netlify Blobs. Without a Blobs environment (plain local dev
 * with npm run dev) it falls back to memory, so everything works for testing but is lost
 * on restart. On Netlify and with netlify dev the data lives in Blobs.
 */
import { getStore } from '@netlify/blobs';

export interface JsonStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  /** keys that start with prefix */
  keys(prefix: string): Promise<string[]>;
}

const memory = new Map<string, Map<string, string>>();

function memoryStore(name: string): JsonStore {
  if (!memory.has(name)) memory.set(name, new Map());
  const m = memory.get(name)!;
  return {
    async get<T>(key: string) {
      const v = m.get(key);
      return v === undefined ? null : (JSON.parse(v) as T);
    },
    async set(key, value) {
      m.set(key, JSON.stringify(value));
    },
    async delete(key) {
      m.delete(key);
    },
    async keys(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

export function store(name: string): JsonStore {
  let blobs: ReturnType<typeof getStore>;
  try {
    blobs = getStore({ name, consistency: 'strong' });
  } catch {
    return memoryStore(name);
  }
  return {
    async get<T>(key: string) {
      return ((await blobs.get(key, { type: 'json' })) as T | null) ?? null;
    },
    async set(key, value) {
      await blobs.setJSON(key, value);
    },
    async delete(key) {
      await blobs.delete(key);
    },
    async keys(prefix) {
      const { blobs: list } = await blobs.list({ prefix });
      return list.map((b) => b.key);
    },
  };
}

/** SHA-256 in hex, for keys that must not contain an e-mail or IP address in clear text */
export async function hash(text: string): Promise<string> {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(data)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
