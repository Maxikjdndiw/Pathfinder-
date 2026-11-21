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

export const emailKey = async (email: string) => `email/${await hash(email.trim().toLowerCase())}`;
