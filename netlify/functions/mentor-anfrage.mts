/**
 * POST /api/mentor-anfrage: a student asks for a real person.
 * Body { code, zusammenfassung, profil?, email?, emailEinwilligung? }
 * Stores the thread (Blobs) and e-mails MENTOR_MAIL_AN when mail is set up.
 * Answer { ok: true, thread } or { error }.
 */
import { isAllowed } from './_shared/codes';
import { normaliseCode } from './_shared/limits';
import { mentorUrl, sendMail } from './_shared/mail';
import { getThread, publicThread, saveThread, vornameFor, type Thread } from './_shared/mentor';
import { json } from './_shared/store';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

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

  const zusammenfassung = String(body.zusammenfassung ?? '').trim().slice(0, 1200);
  const wantsMail = body.emailEinwilligung === true;
  const email = wantsMail ? String(body.email ?? '').trim().toLowerCase().slice(0, 254) : '';
  if (wantsMail && !EMAIL.test(email)) return json(400, { error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  const profil = body.profil && typeof body.profil === 'object' ? (body.profil as Record<string, unknown>) : null;

  const now = new Date().toISOString();
  const old = await getThread(code);
  const vorname = await vornameFor(code);
  const thread: Thread = old
    ? { ...old, zusammenfassung: zusammenfassung || old.zusammenfassung, profil: profil ?? old.profil, email: email || old.email, status: 'offen', aktualisiert: now }
    : {
        code,
        vorname,
        zusammenfassung,
        profil,
        email: email || null,
        status: 'offen',
        erstellt: now,
        aktualisiert: now,
        nachrichten: [],
        mentorBenachrichtigt: null,
        gelesenMentor: null,
      };

  const to = process.env.MENTOR_MAIL_AN ?? '';
  const sent = await sendMail(
    to,
    `Neue Mentor-Anfrage${vorname ? ` von ${vorname}` : ''}`,
    `Neue Anfrage im Pathfinder Coach.\n\nZusammenfassung:\n${zusammenfassung || '(keine)'}\n\nAntworten: ${mentorUrl()}`,
  );
  if (sent) thread.mentorBenachrichtigt = now;
  await saveThread(thread);
  return json(200, { ok: true, thread: publicThread(thread) });
};

export const config = { path: '/api/mentor-anfrage' };

