/**
 * POST /api/mentor-nachrichten: the student's side of the direct chat with the mentor.
 * Body { code, aktion: "holen" } returns the thread (polled every few seconds by the chat).
 * Body { code, aktion: "senden", text, dateien?: [id] } adds a student message (files from /api/upload) and e-mails the mentor
 * (at most every 30 minutes per thread, only when mail is set up).
 * The code is sent in the body, never in the URL.
 */
import { isAllowed } from './_shared/codes';
import { normaliseCode } from './_shared/limits';
import { mentorUrl, sendMail } from './_shared/mail';
import { attachFiles, getThread, MAX_TEXT, publicThread, saveThread } from './_shared/mentor';
import { json } from './_shared/store';

const MAIL_PAUSE_MS = 30 * 60 * 1000;

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
  const thread = await getThread(code);
  if (!thread) return json(200, { thread: null });

  if (body.aktion === 'senden') {
    const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
    const dateien = await attachFiles(code, body.dateien, 'schueler');
    if (!text && !dateien?.length) return json(400, { error: 'Keine Nachricht.' });
    const now = new Date();
    thread.nachrichten.push({ von: 'schueler', text, zeit: now.toISOString(), ...(dateien?.length ? { dateien } : {}) });
    thread.aktualisiert = now.toISOString();
    thread.status = 'offen';
    const last = thread.mentorBenachrichtigt ? Date.parse(thread.mentorBenachrichtigt) : 0;
    if (now.getTime() - last > MAIL_PAUSE_MS) {
      const sent = await sendMail(
        process.env.MENTOR_MAIL_AN ?? '',
        `Neue Nachricht${thread.vorname ? ` von ${thread.vorname}` : ''}`,
        `Im Pathfinder Coach wartet eine neue Nachricht.\n\nAntworten: ${mentorUrl()}`,
      );
      if (sent) thread.mentorBenachrichtigt = now.toISOString();
    }
    await saveThread(thread);
  }
  return json(200, { thread: publicThread(thread) });
};

export const config = { path: '/api/mentor-nachrichten' };
