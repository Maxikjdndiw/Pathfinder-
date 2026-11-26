/**
 * Mentor threads: one direct chat per access code, stored in Blobs ("pathfinder-mentor").
 *   thread/<CODE>   Thread with all messages
 *   index/<CODE>    ChatRow, a small summary for the mentor's chat list (written with every saveThread)
 *   gelesen/<CODE>  { zeit } the newest message time the mentor has seen (kept apart, so reading never rewrites the thread)
 * The AI never writes into a thread; only the student and the mentor do.
 */
import { canonical } from './limits';
import { findRecord } from './codes';
import { hash, store } from './store';
import { getMeta } from './uploads';

export interface MentorMessage {
  von: 'schueler' | 'mentor';
  text: string;
  zeit: string;
  /** attached files (stored in uploads.ts, fetched with the code or the mentor password) */
  dateien?: { id: string; name: string; type: string; size: number }[];
}

/** checks ids against the stored files of this code: only mentor-chat files of the given sender */
export async function attachFiles(code: string, raw: unknown, von: MentorMessage['von']): Promise<MentorMessage['dateien']> {
  if (!Array.isArray(raw)) return [];
  const out: NonNullable<MentorMessage['dateien']> = [];
  for (const id of raw.slice(0, 3)) {
    const meta = await getMeta(code, String(id));
    if (meta && meta.ziel === 'mentor' && meta.von === von) out.push({ id: meta.id, name: meta.name, type: meta.type, size: meta.size });
  }
  return out;
}

export interface Thread {
  code: string;
  vorname: string | null;
  zusammenfassung: string;
  profil: Record<string, unknown> | null;
  /** only with consent: notify the student by e-mail when the mentor answers */
  email: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  aktualisiert: string;
  nachrichten: MentorMessage[];
  /** last time the mentor got an e-mail about this thread (at most every 30 minutes) */
  mentorBenachrichtigt: string | null;
  /** read markers: the latest message time each side has seen (older threads; newer ones use gelesen/<CODE>) */
  gelesenMentor: string | null;
  /** how the chat started: the request with an AI summary, or "Mentor" on the dashboard (no AI) */
  quelle?: 'anfrage' | 'tab';
}

/** one line in the mentor's chat list */
export interface ChatRow {
  code: string;
  vorname: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  aktualisiert: string;
  anzahl: number;
  letzte: string;
  letzteVon: 'schueler' | 'mentor' | null;
  quelle: 'anfrage' | 'tab';
  zusammenfassung: string;
  /** times of the latest student messages, to count unread ones */
  schuelerZeiten: string[];
  /** read marker of older threads */
  gelesenAlt: string | null;
}

export function rowFor(t: Thread): ChatRow {
  const last = t.nachrichten.at(-1);
  return {
    code: t.code,
    vorname: t.vorname,
    status: t.status,
    erstellt: t.erstellt,
    aktualisiert: t.aktualisiert,
    anzahl: t.nachrichten.length,
    letzte: last ? (last.text || (last.dateien?.length ? `Datei: ${last.dateien[0].name}` : '')).slice(0, 140) : '',
    letzteVon: last?.von ?? null,
    quelle: t.quelle ?? 'anfrage',
    zusammenfassung: t.zusammenfassung.slice(0, 160),
    schuelerZeiten: t.nachrichten.filter((m) => m.von === 'schueler').slice(-50).map((m) => m.zeit),
    gelesenAlt: t.gelesenMentor,
  };
}
export const indexKey = (code: string) => `index/${canonical(code)}`;
const readKey = (code: string) => `gelesen/${canonical(code)}`;

export async function getRead(code: string): Promise<string | null> {
  return (await mentorStore().get<{ zeit: string }>(readKey(code)))?.zeit ?? null;
}
export async function setRead(code: string, zeit: string): Promise<void> {
  await mentorStore().set(readKey(code), { zeit });
}
/** unread student messages for the mentor */
export function unreadCount(row: Pick<ChatRow, 'schuelerZeiten' | 'gelesenAlt'>, gelesen: string | null): number {
  const seen = gelesen ?? row.gelesenAlt ?? '';
  return row.schuelerZeiten.filter((z) => z > seen).length;
}

const PROFIL_TEXT = ['klasse', 'bundesland', 'note', 'cv_status', 'ziel', 'naechster_schritt', 'stufe'];
const PROFIL_LIST = ['interessen', 'felder', 'berufe'];
/** the student profile as background for the mentor: known fields only, short */
export function cleanProfil(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PROFIL_TEXT) if (typeof r[k] === 'string' || typeof r[k] === 'number') out[k] = String(r[k]).trim().slice(0, 200);
  for (const k of PROFIL_LIST) if (Array.isArray(r[k])) out[k] = (r[k] as unknown[]).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !(out[k] as unknown[]).length)) delete out[k];
  return Object.keys(out).length ? out : null;
}

export const mentorStore = () => store('pathfinder-mentor');
export const threadKey = (code: string) => `thread/${canonical(code)}`;
export const MAX_TEXT = 2000;

export async function getThread(code: string): Promise<Thread | null> {
  return mentorStore().get<Thread>(threadKey(code));
}

export async function saveThread(t: Thread): Promise<void> {
  const s = mentorStore();
  await Promise.all([s.set(threadKey(t.code), t), s.set(indexKey(t.code), rowFor(t))]);
}

export async function vornameFor(code: string): Promise<string | null> {
  return (await findRecord(code))?.vorname ?? null;
}

/** what the student's browser may see */
export const publicThread = (t: Thread) => ({
  status: t.status,
  erstellt: t.erstellt,
  nachrichten: t.nachrichten,
  emailBenachrichtigung: Boolean(t.email),
});

/** after this many wrong passwords from one address within 15 minutes, logins pause */
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Password check for the mentor area: constant time, a short delay on every wrong try, and a
 * pause after MAX_FAILS wrong tries per address and 15 minutes (against guessing).
 */
export async function mentorAuth(req: Request): Promise<'ok' | 'fehlt' | 'falsch' | 'gesperrt'> {
  const expected = process.env.MENTOR_PASSWORT;
  if (!expected) return 'fehlt';
  const ip = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unbekannt';
  const fails = store('pathfinder-mentor-sperre');
  const key = `${await hash(ip)}:${Math.floor(Date.now() / WINDOW_MS)}`;
  const count = (await fails.get<number>(key)) ?? 0;
  if (count >= MAX_FAILS) return 'gesperrt';
  const given = req.headers.get('x-mentor-passwort') ?? '';
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(expected))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  if (diff !== 0) {
    await fails.set(key, count + 1);
    await new Promise((r) => setTimeout(r, 600));
    return 'falsch';
  }
  return 'ok';
}
