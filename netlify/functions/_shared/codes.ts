/**
 * Access codes in two places:
 *   (a) env PATHFINDER_ACCESS_CODES (see limits.ts), always valid
 *   (b) codes people requested themselves on /app#zugang, stored in Blobs ("pathfinder-codes")
 * Store keys:
 *   code/<CODE>        { code, vorname, email, erstellt, zuletztBenutzt, gesperrt }
 *   email/<hash>       { code }           one access per e-mail address
 *   ip/<hash>/<hour>   count              requests per IP and hour
 *   tag/<date>         count              new codes per day
 *   warteliste/<hash>  { vorname, email, zeit }
 *   login/<day>/<CODE> 1                  this code was active on that day (Berlin time), for the mentor overview
 *   seen/<CODE>        { code, erst, letzter }  first and latest activity, also for fixed codes
 */
import { accessCodes, canonical } from './limits';
import { hash, store } from './store';

export interface AccessRecord {
  code: string;
  vorname: string;
  email: string;
  erstellt: string;
  zuletztBenutzt: string | null;
  gesperrt: boolean;
}

export const codesStore = () => store('pathfinder-codes');

/** letters without I and O, so a code is easy to read and type */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newCode(): string {
  const r = crypto.getRandomValues(new Uint32Array(8));
  const letters = [...r.slice(0, 4)].map((n) => LETTERS[n % LETTERS.length]).join('');
  const digits = [...r.slice(4)].map((n) => String(n % 10)).join('');
  return `${letters}-${digits}`;
}

export async function findRecord(code: string): Promise<AccessRecord | null> {
  const c = canonical(code);
  if (!c) return null;
  return codesStore().get<AccessRecord>(`code/${c}`);
}

/** env codes, or a stored code that is not blocked. touch: remember the time of this login */
export async function isAllowed(code: string, touch = false): Promise<boolean> {
  const c = canonical(code);
  if (!c) return false;
  if (accessCodes().includes(c)) return true;
  const s = codesStore();
  const rec = await s.get<AccessRecord>(`code/${c}`);
  if (!rec || rec.gesperrt) return false;
  if (touch) await s.set(`code/${c}`, { ...rec, zuletztBenutzt: new Date().toISOString() });
  return true;
}

/** first name from the signup for a self-requested code; fixed codes have none */
export async function nameFor(code: string): Promise<string> {
  const c = canonical(code);
  if (!c || accessCodes().includes(c)) return '';
  const rec = await codesStore().get<AccessRecord>(`code/${c}`);
  return rec && !rec.gesperrt ? String(rec.vorname ?? '').slice(0, 40) : '';
}

/** YYYY-MM-DD in German time */
export const berlinDay = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);

export interface SeenRecord {
  code: string;
  erst: string;
  letzter: string;
}
/** Remembers that a code was used today: one read, and two writes only on the first use of the day. */
export async function recordActivity(code: string): Promise<void> {
  const c = canonical(code);
  if (!c) return;
  try {
    const s = codesStore();
    const now = new Date();
    const day = berlinDay(now);
    const seen = await s.get<SeenRecord>(`seen/${c}`);
    if (seen && berlinDay(new Date(seen.letzter)) === day) return;
    await Promise.all([
      s.set(`login/${day}/${c}`, 1),
      s.set(`seen/${c}`, { code: c, erst: seen?.erst ?? now.toISOString(), letzter: now.toISOString() } satisfies SeenRecord),
    ]);
  } catch {
    /* statistics only: never block a login or a message */
  }
}

export const emailKey = async (email: string) => `email/${await hash(email.trim().toLowerCase())}`;
