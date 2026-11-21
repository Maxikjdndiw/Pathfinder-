/**
 * Uploaded files (AI chat and mentor chat) in Netlify Blobs ("pathfinder-uploads").
 * Key: <CODE>/<id>. Only reachable through the student's code or the mentor password,
 * never through a public link. Files expire after 30 days (scheduled clean-up plus a
 * check on every access). File contents are never written to logs.
 */
import { getStore } from '@netlify/blobs';
import { canonical } from './limits';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 3;
export const MAX_PDF_PAGES = 5;
export const MAX_AI_UPLOADS_PER_DAY = 5;
export const MAX_MENTOR_UPLOADS_PER_DAY = 10;
export const KEEP_DAYS = 30;

export type FileType = 'application/pdf' | 'image/png' | 'image/jpeg' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface FileMeta {
  id: string;
  name: string;
  type: FileType;
  size: number;
  zeit: string;
  /** ki: for the AI chat, mentor: for the direct chat */
  ziel: 'ki' | 'mentor';
  von: 'schueler' | 'mentor';
}

/** what the browser needs to show a file chip */
export const publicMeta = ({ id, name, type, size, zeit, von }: FileMeta) => ({ id, name, type, size, zeit, von });

/** the real type from the first bytes, not from the file name */
export function sniffType(b: Uint8Array): FileType | null {
  const starts = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    // a zip file: only a Word document counts (its part names are stored as plain text)
    const head = new TextDecoder('latin1').decode(b);
    if (head.includes('word/')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

/** pages of a PDF, counted from its page objects (good enough for a limit) */
export function pdfPages(b: Uint8Array): number {
  const text = new TextDecoder('latin1').decode(b);
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export const expired = (m: FileMeta, now = Date.now()) => now - Date.parse(m.zeit) > KEEP_DAYS * 86400000;

// ---------- storage ----------
const memory = new Map<string, { data: Uint8Array; meta: FileMeta }>();
let blobs: ReturnType<typeof getStore> | null | undefined;
function store() {
  if (blobs === undefined) {
    try {
      blobs = getStore({ name: 'pathfinder-uploads', consistency: 'strong' });
    } catch {
      blobs = null; // plain local dev: memory only
    }
  }
  return blobs;
}

const key = (code: string, id: string) => `${canonical(code)}/${id.replace(/[^a-z0-9]/gi, '')}`;

export async function saveFile(code: string, data: Uint8Array, meta: FileMeta): Promise<void> {
  const s = store();
  if (!s) return void memory.set(key(code, meta.id), { data, meta });
  await s.set(key(code, meta.id), data.slice().buffer as ArrayBuffer, { metadata: { ...meta } });
}

export async function getMeta(code: string, id: string): Promise<FileMeta | null> {
  const s = store();
  let meta: FileMeta | null = null;
  if (!s) meta = memory.get(key(code, id))?.meta ?? null;
  else meta = ((await s.getMetadata(key(code, id)))?.metadata as unknown as FileMeta) ?? null;
  if (meta && expired(meta)) {
    await deleteFile(code, id);
    return null;
  }
  return meta;
}

export async function getFile(code: string, id: string): Promise<{ data: Uint8Array; meta: FileMeta } | null> {
  const meta = await getMeta(code, id);
  if (!meta) return null;
  const s = store();
  if (!s) return memory.get(key(code, id)) ?? null;
  const buf = await s.get(key(code, id), { type: 'arrayBuffer' });
  return buf ? { data: new Uint8Array(buf), meta } : null;
}

export async function deleteFile(code: string, id: string): Promise<void> {
  const s = store();
  if (!s) return void memory.delete(key(code, id));
  await s.delete(key(code, id));
}

/** deletes everything older than KEEP_DAYS; returns how many files went */
export async function cleanUp(now = Date.now()): Promise<number> {
  const s = store();
  let n = 0;
  if (!s) {
    for (const [k, v] of memory) if (expired(v.meta, now)) (memory.delete(k), n++);
    return n;
  }
  const { blobs: list } = await s.list();
  for (const b of list) {
    const meta = (await s.getMetadata(b.key))?.metadata as unknown as FileMeta | undefined;
    if (!meta || expired(meta, now)) {
      await s.delete(b.key);
      n++;
    }
  }
  return n;
}

export const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** safe file name for headers and display */
export const cleanName = (name: string) => name.replace(/[\\/\r\n"]/g, '').trim().slice(0, 120) || 'datei';

/** the file itself as a download, never cached */
export function fileResponse(data: Uint8Array, type: string, name: string): Response {
  return new Response(data.slice().buffer as ArrayBuffer, {
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
