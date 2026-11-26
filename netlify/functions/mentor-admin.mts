/**
 * POST /api/mentor-admin: everything the mentor page needs.
 * The password from MENTOR_PASSWORT comes in the header x-mentor-passwort and is checked here,
 * on the server, for every request. Without MENTOR_PASSWORT the mentor area stays closed.
 *
 * Body { aktion }:
 *   "liste"      the chat list only: one small row per chat (no messages), with unread counts
 *   "verlauf"    { code, vor? } header and the latest 50 messages (or 50 before index vor); marks the chat as read
 *   "neu"        { code, seit } messages from index seit on, for light polling of the open chat
 *   "antworten"  { code, text, dateien? } mentor message; e-mails the student if they agreed to it
 *   "status"     { code, status: "offen" | "erledigt" }
 *   "suche"      { q } codes of chats whose messages contain q (at least 3 characters)
 *   "zugaenge"   the self-requested accesses and the waiting list
 *   "uebersicht" key figures, signups and logins per day (30 days), latest logins
 *   "sperren"    { code, gesperrt: boolean } blocks or unblocks a self-requested access
 *   "datei"      { code, id } a file from the direct chat, as a download
 *   "datei-loeschen" { code, id } deletes a file at once
 */
import { berlinDay, codesStore, type AccessRecord, type SeenRecord } from './_shared/codes';
import { canonical } from './_shared/limits';
import { sendMail, siteUrl } from './_shared/mail';
import {
  attachFiles,
  getRead,
  getThread,
  indexKey,
  MAX_TEXT,
  mentorAuth,
  mentorStore,
  rowFor,
  saveThread,
  setRead,
  unreadCount,
  type ChatRow,
  type Thread,
} from './_shared/mentor';
import { deleteFile, fileResponse, getFile } from './_shared/uploads';
import { json } from './_shared/store';

const PAGE = 50;
const DAY_MS = 86_400_000;

/** all chat rows; older threads without a row get one now (once) */
async function chatRows(): Promise<(ChatRow & { ungelesen: number })[]> {
  const ms = mentorStore();
  const [indexKeys, threadKeys] = await Promise.all([ms.keys('index/'), ms.keys('thread/')]);
  const have = new Set(indexKeys.map((k) => k.slice(6)));
  const missing = threadKeys.map((k) => k.slice(7)).filter((c) => !have.has(c));
  const rows = (await Promise.all(indexKeys.map((k) => ms.get<ChatRow>(k)))).filter(Boolean) as ChatRow[];
  for (const t of (await Promise.all(missing.map((c) => getThread(c)))).filter(Boolean) as Thread[]) {
    const row = rowFor(t);
    await ms.set(indexKey(t.code), row);
    rows.push(row);
  }
  const reads = await Promise.all(rows.map((r) => getRead(r.code)));
  return rows.map((r, i) => ({ ...r, ungelesen: unreadCount(r, reads[i]) }));
}

/** marks a chat as read up to its newest student message (a separate key, the thread is not rewritten) */
async function markRead(t: Thread) {
  const newest = [...t.nachrichten].reverse().find((m) => m.von === 'schueler')?.zeit;
  if (!newest) return;
  const seen = (await getRead(t.code)) ?? t.gelesenMentor ?? '';
  if (newest > seen) await setRead(t.code, newest);
}

const head = (t: Thread) => ({
  code: t.code,
  vorname: t.vorname,
  status: t.status,
  erstellt: t.erstellt,
  zusammenfassung: t.zusammenfassung,
  profil: t.profil,
  email: t.email ? 'ja' : null,
  quelle: t.quelle ?? 'anfrage',
});

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
      const rows = await chatRows();
      return json(200, {
        chats: rows
          .map(({ schuelerZeiten, gelesenAlt, ...r }) => ({ ...r, letzteSchueler: schuelerZeiten.at(-1) ?? null }))
          .sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert)),
      });
    }
    case 'verlauf': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Chat nicht gefunden.' });
      const total = t.nachrichten.length;
      const end = typeof body.vor === 'number' ? Math.max(0, Math.min(total, body.vor)) : total;
      const start = Math.max(0, end - PAGE);
      if (typeof body.vor !== 'number') await markRead(t);
      return json(200, { kopf: head(t), nachrichten: t.nachrichten.slice(start, end), start, total });
    }
    case 'neu': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Chat nicht gefunden.' });
      const seit = Math.max(0, Math.min(t.nachrichten.length, Number(body.seit) || 0));
      const neu = t.nachrichten.slice(seit);
      if (neu.some((m) => m.von === 'schueler')) await markRead(t);
      return json(200, { nachrichten: neu, total: t.nachrichten.length, status: t.status });
    }
    case 'antworten': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Chat nicht gefunden.' });
      const text = String(body.text ?? '').trim().slice(0, MAX_TEXT);
      const dateien = await attachFiles(t.code, body.dateien, 'mentor');
      if (!text && !dateien?.length) return json(400, { error: 'Keine Nachricht.' });
      const now = new Date().toISOString();
      const nachricht = { von: 'mentor' as const, text, zeit: now, ...(dateien?.length ? { dateien } : {}) };
      t.nachrichten.push(nachricht);
      t.aktualisiert = now;
      await saveThread(t);
      await markRead(t);
      // only with the student's consent; the e-mail does not contain the message itself
      if (t.email) {
        await sendMail(
          t.email,
          'Neue Antwort von deinem Mentor',
          `Hallo${t.vorname ? ` ${t.vorname}` : ''},\n\ndein Mentor hat dir im Pathfinder Coach geantwortet. Du liest die Antwort hier: ${siteUrl()}/app\n\nViele Grüße\nPathfinder DE`,
        );
      }
      return json(200, { nachricht, total: t.nachrichten.length });
    }
    case 'status': {
      const t = await getThread(String(body.code ?? ''));
      if (!t) return json(404, { error: 'Chat nicht gefunden.' });
      t.status = body.status === 'erledigt' ? 'erledigt' : 'offen';
      await saveThread(t);
      return json(200, { ok: true });
    }
    case 'suche': {
      // message text search, only when the mentor types (the list itself never loads messages)
      const q = String(body.q ?? '').trim().toLowerCase().slice(0, 80);
      if (q.length < 3) return json(200, { codes: [] });
      const ms = mentorStore();
      const threads = (await Promise.all((await ms.keys('thread/')).map((k) => ms.get<Thread>(k)))).filter(Boolean) as Thread[];
      return json(200, { codes: threads.filter((t) => t.nachrichten.some((m) => m.text.toLowerCase().includes(q))).map((t) => t.code) });
    }
    case 'zugaenge': {
      const cs = codesStore();
      const [codeKeys, wait] = await Promise.all([cs.keys('code/'), cs.keys('warteliste/')]);
      const zugaenge = (await Promise.all(codeKeys.map((k) => cs.get<AccessRecord>(k)))).filter(Boolean) as AccessRecord[];
      return json(200, {
        zugaenge: zugaenge
          .map(({ code, vorname, erstellt, zuletztBenutzt, gesperrt }) => ({ code, vorname, erstellt, zuletztBenutzt, gesperrt }))
          .sort((a, b) => b.erstellt.localeCompare(a.erstellt)),
        warteliste: wait.length,
      });
    }
    case 'uebersicht': {
      const cs = codesStore();
      const now = new Date();
      const days = Array.from({ length: 30 }, (_, i) => berlinDay(new Date(now.getTime() - (29 - i) * DAY_MS)));
      const today = days[29];
      const week = new Set(days.slice(23));
      const [codeKeys, seenKeys, loginLists, rows] = await Promise.all([
        cs.keys('code/'),
        cs.keys('seen/'),
        Promise.all(days.map((d) => cs.keys(`login/${d}/`))),
        chatRows(),
      ]);
      const [recs, seen] = await Promise.all([
        Promise.all(codeKeys.map((k) => cs.get<AccessRecord>(k))).then((x) => x.filter(Boolean) as AccessRecord[]),
        Promise.all(seenKeys.map((k) => cs.get<SeenRecord>(k))).then((x) => x.filter(Boolean) as SeenRecord[]),
      ]);
      const signupDay = recs.map((r) => berlinDay(new Date(r.erstellt)));
      const active = new Set(loginLists.slice(23).flat().map((k) => k.split('/')[2]));
      const names = new Map(recs.map((r) => [r.code, r.vorname]));
      return json(200, {
        kpi: {
          gesamt: recs.length,
          heute: signupDay.filter((d) => d === today).length,
          woche: signupDay.filter((d) => week.has(d)).length,
          aktiv: active.size,
          ungelesen: rows.reduce((n, r) => n + r.ungelesen, 0),
        },
        tage: days.map((d, i) => ({ tag: d, anmeldungen: signupDay.filter((x) => x === d).length, logins: loginLists[i].length })),
        zuletzt: seen
          .sort((a, b) => b.letzter.localeCompare(a.letzter))
          .slice(0, 12)
          .map((x) => ({ code: x.code, vorname: names.get(x.code) ?? null, letzter: x.letzter, erst: x.erst })),
      });
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
