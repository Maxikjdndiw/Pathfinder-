/**
 * POST /api/profilbild: the student's own profile photo, stored in Netlify Blobs ("pathfinder-profilbilder").
 * Body { code, aktion: "holen" }               returns { bild: data URL or null }
 * Body { code, aktion: "speichern", bild }     bild: data URL (JPEG or WebP), already cropped and made
 *                                              smaller in the browser (400 x 400, without metadata)
 * Body { code, aktion: "loeschen" }            deletes the photo
 * Only the access code itself reaches its photo: no public link, no list, the mentor page never
 * loads it, and it is never sent to the AI. The code is sent in the body, never in the URL.
 */
import { isAllowed } from './_shared/codes';
import { canonical, normaliseCode } from './_shared/limits';
import { json, store } from './_shared/store';

const MAX_BYTES = 300 * 1024;
const MAX_SAVES_PER_DAY = 30;

interface Photo {
  type: 'image/jpeg' | 'image/webp';
  base64: string;
  zeit: string;
}

const photos = () => store('pathfinder-profilbilder');
const key = (code: string) => `bild/${canonical(code)}`;

/** JPEG (FF D8 FF) or WebP (RIFF ... WEBP), checked on the bytes, not on the name */
function kind(bytes: Uint8Array): Photo['type'] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ungültige Anfrage.' });
  }
  const code = normaliseCode(body.code);
  if (!(await isAllowed(code))) return json(401, { error: 'Dieser Zugangscode ist nicht gültig.' });
  const s = photos();

  if (body.aktion === 'holen') {
    const p = await s.get<Photo>(key(code));
    return json(200, { bild: p ? `data:${p.type};base64,${p.base64}` : null });
  }

  if (body.aktion === 'loeschen') {
    await s.delete(key(code));
    return json(200, { ok: true });
  }

  if (body.aktion === 'speichern') {
    const m = /^data:image\/(jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.bild ?? ''));
    if (!m) return json(400, { error: 'Das Bild konnte nicht gespeichert werden. Bitte wähle ein JPG, PNG oder WebP.' });
    const bytes = Uint8Array.from(Buffer.from(m[2], 'base64'));
    if (bytes.length > MAX_BYTES) return json(413, { error: 'Das Bild ist zu groß. Bitte versuche es noch einmal.' });
    const type = kind(bytes);
    if (!type) return json(400, { error: 'Das ist kein gültiges Bild. Bitte wähle ein JPG, PNG oder WebP.' });
    // a small daily limit against misuse
    const day = new Date().toISOString().slice(0, 10);
    const countKey = `zaehler/${canonical(code)}/${day}`;
    const count = (await s.get<number>(countKey)) ?? 0;
    if (count >= MAX_SAVES_PER_DAY) return json(429, { error: 'Du hast dein Profilbild heute schon oft geändert. Morgen geht es wieder.' });
    await Promise.all([s.set(key(code), { type, base64: m[2], zeit: new Date().toISOString() } satisfies Photo), s.set(countKey, count + 1)]);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unbekannte Aktion.' });
};

export const config = { path: '/api/profilbild' };
