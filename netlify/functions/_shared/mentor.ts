/**
 * Mentor threads: one direct chat per access code, stored in Blobs ("pathfinder-mentor").
 *   thread/<CODE>  Thread
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
  /** read markers: the latest message time each side has seen */
  gelesenMentor: string | null;
}

export const mentorStore = () => store('pathfinder-mentor');
export const threadKey = (code: string) => `thread/${canonical(code)}`;
export const MAX_TEXT = 2000;

export async function getThread(code: string): Promise<Thread | null> {
  return mentorStore().get<Thread>(threadKey(code));
}

export async function saveThread(t: Thread): Promise<void> {
  await mentorStore().set(threadKey(t.code), t);
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
