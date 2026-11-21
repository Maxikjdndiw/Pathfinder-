/**
 * POST /api/mentor-admin: everything the mentor page (/mentor) needs.
 * The password from MENTOR_PASSWORT comes in the header x-mentor-passwort and is checked here,
 * on the server, for every request. Without MENTOR_PASSWORT the mentor area stays closed.
 *
 * Body { aktion }:
 *   "liste"     open and done threads (without messages) and the self-requested accesses
 *   "verlauf"   { code } one thread with all messages (marks it as read)
 *   "antworten" { code, text } mentor message; e-mails the student if they agreed to it
 *   "status"    { code, status: "offen" | "erledigt" }
 *   "sperren"   { code, gesperrt: boolean } blocks or unblocks a self-requested access
 *   "datei"     { code, id } a file from the direct chat, as a download
 *   "datei-loeschen" { code, id } deletes a file at once
 */
import { codesStore, type AccessRecord } from './_shared/codes';
import { canonical } from './_shared/limits';
import { sendMail, siteUrl } from './_shared/mail';
import { attachFiles, getThread, MAX_TEXT, mentorAuth, mentorStore, saveThread, type Thread } from './_shared/mentor';
import { deleteFile, fileResponse, getFile } from './_shared/uploads';
import { json } from './_shared/store';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  const auth = await mentorAuth(req);
  if (auth === 'fehlt') return json(503, { error: 'Der Mentorenbereich ist noch nicht eingerichtet (MENTOR_PASSWORT fehlt).' });
  if (auth === 'falsch') return json(401, { error: 'Falsches Passwort.' });
  if (auth === 'gesperrt') return json(429, { error: 'Zu viele falsche Versuche. Bitte warte 15 Minuten.' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ungültige Anfrage.' });
  }

  switch (body.aktion) {
    case 'liste': {
      const ms = mentorStore();
      const threads = (await Promise.all((await ms.keys('thread/')).map((k) => ms.get<Thread>(k)))).filter(Boolean) as Thread[];
      const cs = codesStore();
      const zugaenge = (await Promise.all((await cs.keys('code/')).map((k) => cs.get<AccessRecord>(k)))).filter(Boolean) as AccessRecord[];
      const warteliste = (await cs.keys('warteliste/')).length;
      return json(200, {
        threads: threads
          .map((t) => {
            const lastStudent = [...t.nachrichten].reverse().find((m) => m.von === 'schueler')?.zeit ?? t.erstellt;
            return {
              code: t.code,
              vorname: t.vorname,
              status: t.status,
              erstellt: t.erstellt,
              aktualisiert: t.aktualisiert,
              anzahl: t.nachrichten.length,
              ungelesen: !t.gelesenMentor || lastStudent > t.gelesenMentor,
              zusammenfassung: t.zusammenfassung.slice(0, 160),
            };
          })
          .sort((a, b) => (a.status === b.status ? b.aktualisiert.localeCompare(a.aktualisiert) : a.status === 'offen' ? -1 : 1)),
        zugaenge: zugaenge
          .map(({ code, vorname, erstellt, zuletztBenutzt, gesperrt }) => ({ code, vorname, erstellt, zuletztBenutzt, gesperrt }))
          .sort((a, b) => b.erstellt.localeCompare(a.erstellt)),
        warteliste,
      });
    }
    case 'verlauf': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Anfrage nicht gefunden.' });
      t.gelesenMentor = new Date().toISOString();
      await saveThread(t);
      return json(200, { thread: { ...t, email: t.email ? 'ja' : null } });
    }
    case 'antworten': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Anfrage nicht gefunden.' });
      const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
      const dateien = await attachFiles(t.code, body.dateien, 'mentor');
      if (!text && !dateien?.length) return json(400, { error: 'Keine Nachricht.' });
      const now = new Date().toISOString();
      t.nachrichten.push({ von: 'mentor', text, zeit: now, ...(dateien?.length ? { dateien } : {}) });
      t.aktualisiert = now;
      t.gelesenMentor = now;
      await saveThread(t);
      // only with the student's consent; the e-mail does not contain the message itself
      if (t.email) {
        await sendMail(
          t.email,
          'Neue Antwort von deinem Mentor',
          `Hallo${t.vorname ? ` ${t.vorname}` : ''},\n\ndein Mentor hat dir im Pathfinder Coach geantwortet. Du liest die Antwort hier: ${siteUrl()}/app\n\nViele Grüße\nPathfinder DE`,
        );
      }
      return json(200, { ok: true });
    }
    case 'status': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Anfrage nicht gefunden.' });
      t.status = body.status === 'erledigt' ? 'erledigt' : 'offen';
      await saveThread(t);
      return json(200, { ok: true });
    }
    case 'sperren': {
      const cs = codesStore();
      const key = `code/${canonical(body.code)}`;
      const rec = await cs.get<AccessRecord>(key);
      if (!rec) return json(404, { error: 'Zugang nicht gefunden.' });
      await cs.set(key, { ...rec, gesperrt: body.gesperrt === true });
      return json(200, { ok: true });
    }
    case 'datei': {
      const t = await getThread(String(body.code ?? ''));
      const file = t ? await getFile(t.code, String(body.id ?? '')) : null;
      if (!file || file.meta.ziel !== 'mentor') return json(404, { error: 'Die Datei gibt es nicht mehr.' });
      return fileResponse(file.data, file.meta.type, file.meta.name);
    }
    case 'datei-loeschen': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Anfrage nicht gefunden.' });
      await deleteFile(t.code, String(body.id ?? ''));
      return json(200, { ok: true });
    }
    default:
      return json(400, { error: 'Unbekannte Aktion.' });
  }
};

export const config = { path: '/api/mentor-admin' };
