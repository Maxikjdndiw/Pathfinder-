/**
 * POST /api/datei: the student's own files. Body { code, id, aktion: "holen" | "loeschen" }.
 * "holen" returns the file itself (never a public link), "loeschen" deletes it at once.
 */
import { isAllowed } from './_shared/codes';
import { normaliseCode } from './_shared/limits';
import { json } from './_shared/store';
import { deleteFile, fileResponse, getFile } from './_shared/uploads';

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
  const id = String(body.id ?? '');

  if (body.aktion === 'loeschen') {
    await deleteFile(code, id);
    return json(200, { ok: true });
  }
  const file = await getFile(code, id);
  if (!file) return json(404, { error: 'Die Datei gibt es nicht mehr.' });
  return fileResponse(file.data, file.meta.type, file.meta.name);
};

export const config = { path: '/api/datei' };
