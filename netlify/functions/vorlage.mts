/**
 * POST /api/vorlage: the CV and portfolio templates, only for people with a valid access code.
 * Body { code, id } with id schueler, wirtschaft, technik or kreativ. Answer: the file itself.
 * The files come unchanged from vorlagen/ (embedded by scripts/build-app-data.mjs).
 */
import { isAllowed } from './_shared/codes';
import { normaliseCode } from './_shared/limits';
import { json } from './_shared/store';
import { fileResponse } from './_shared/uploads';
import { VORLAGEN_DATEIEN } from './_shared/vorlagen.generated';

const TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ungültige Anfrage.' });
  }
  if (!(await isAllowed(normaliseCode(body.code)))) return json(401, { error: 'Bitte melde dich zuerst an.' });
  const v = VORLAGEN_DATEIEN.find((x) => x.id === body.id);
  if (!v) return json(404, { error: 'Diese Vorlage gibt es nicht.' });
  const ext = v.datei.split('.').pop() ?? '';
  return fileResponse(new Uint8Array(Buffer.from(v.base64, 'base64')), TYPES[ext] ?? 'application/octet-stream', v.datei);
};

export const config = { path: '/api/vorlage' };
