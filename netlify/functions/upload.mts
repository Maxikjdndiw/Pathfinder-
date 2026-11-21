/**
 * POST /api/upload: one file per request, the raw bytes as body (so 5 MB stay below the
 * request limit of Netlify Functions). Headers:
 *   x-code       the student's access code (whose files these are)
 *   x-ziel       "ki" (AI chat) or "mentor" (direct chat)
 *   x-dateiname  the file name, URI encoded
 *   x-mentor-passwort  only when the mentor sends a file back from /mentor
 * Checks on the server: real type from the first bytes (PDF, DOCX, PNG, JPG), at most 5 MB,
 * PDFs for the AI at most 5 pages, 5 AI uploads per code and day.
 * Answer { file: { id, name, type, size, zeit, von } } or { error }.
 */
import { isAllowed } from './_shared/codes';
import { canonical, normaliseCode } from './_shared/limits';
import { mentorAuth } from './_shared/mentor';
import { json, store } from './_shared/store';
import {
  cleanName,
  MAX_AI_UPLOADS_PER_DAY,
  MAX_BYTES,
  MAX_MENTOR_UPLOADS_PER_DAY,
  MAX_PDF_PAGES,
  newId,
  pdfPages,
  publicMeta,
  saveFile,
  sniffType,
  type FileMeta,
} from './_shared/uploads';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  const code = normaliseCode(req.headers.get('x-code'));
  const ziel = req.headers.get('x-ziel') === 'mentor' ? 'mentor' : 'ki';
  let von: FileMeta['von'] = 'schueler';

  if (req.headers.has('x-mentor-passwort')) {
    const auth = await mentorAuth(req);
    if (auth === 'gesperrt') return json(429, { error: 'Zu viele falsche Versuche. Bitte warte 15 Minuten.' });
    if (auth !== 'ok') return json(401, { error: 'Falsches Passwort.' });
    von = 'mentor';
  } else if (!(await isAllowed(code))) {
    return json(401, { error: 'Dieser Zugangscode ist nicht gültig.' });
  }
  if (von === 'mentor' && ziel !== 'mentor') return json(400, { error: 'Ungültige Anfrage.' });

  // the body must be sent as raw bytes; text or form encodings would garble a binary file
  const ctype = req.headers.get('content-type') ?? '';
  if (/^(text\/|application\/x-www-form-urlencoded|multipart\/)/i.test(ctype)) return json(415, { error: 'Bitte die Datei als Datei senden.' });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return json(413, { error: 'Die Datei ist größer als 5 MB.' });
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length) return json(400, { error: 'Die Datei ist leer.' });
  if (data.length > MAX_BYTES) return json(413, { error: 'Die Datei ist größer als 5 MB.' });

  const type = sniffType(data);
  if (!type) return json(415, { error: 'Diese Datei geht nicht. Erlaubt sind PDF, DOCX, PNG und JPG.' });
  if (ziel === 'ki' && type === 'application/pdf' && pdfPages(data) > MAX_PDF_PAGES) {
    return json(400, { error: `Die PDF hat mehr als ${MAX_PDF_PAGES} Seiten. Bitte schick nur die wichtigsten Seiten.` });
  }

  // daily limit per code (the mentor's files do not count)
  if (von === 'schueler') {
    const limit = ziel === 'ki' ? MAX_AI_UPLOADS_PER_DAY : MAX_MENTOR_UPLOADS_PER_DAY;
    const counts = store('pathfinder-uploads-zaehler');
    const key = `${canonical(code)}:${ziel}:${new Date().toISOString().slice(0, 10)}`;
    const used = (await counts.get<number>(key)) ?? 0;
    if (used >= limit) return json(429, { error: `Heute gehen höchstens ${limit} Dateien. Morgen wieder.` });
    await counts.set(key, used + 1);
  }

  let name = 'datei';
  try {
    name = cleanName(decodeURIComponent(req.headers.get('x-dateiname') ?? 'datei'));
  } catch {
    name = 'datei';
  }
  const meta: FileMeta = { id: newId(), name, type, size: data.length, zeit: new Date().toISOString(), ziel, von };
  await saveFile(code, data, meta);
  return json(200, { file: publicMeta(meta) });
};

export const config = { path: '/api/upload' };
