/**
 * POST /api/zugang: request an access code. Body { vorname, email, datenschutz, website }.
 * "website" is a honeypot: people never see it, bots fill it in.
 * Answer { ok: true, code, mail } or { error } (with warteliste: true when the daily limit is reached).
 *
 * Protection: 3 requests per IP and hour, one access per e-mail address, and at most
 * MAX_NEUE_CODES_PRO_TAG new codes per day (default 30), so the AI budget cannot run out.
 */
import type { Context } from '@netlify/functions';
import { codesStore, emailKey, newCode, type AccessRecord } from './_shared/codes';
import { accessCodes, canonical } from './_shared/limits';
import { mailConfigured, sendMail, siteUrl } from './_shared/mail';
import { hash, json } from './_shared/store';

const PER_IP_HOUR = 3;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export default async (req: Request, context?: Context) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ungültige Anfrage.' });
  }
  const vorname = String(body.vorname ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 254);

  // a bot filled the hidden field: answer like an error, store nothing
  if (String(body.website ?? '').trim()) return json(400, { error: 'Das hat nicht geklappt. Bitte versuche es noch einmal.' });
  if (!vorname) return json(400, { error: 'Bitte gib deinen Vornamen ein.' });
  if (!EMAIL.test(email)) return json(400, { error: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
  if (body.datenschutz !== true) return json(400, { error: 'Bitte bestätige den Datenschutzhinweis.' });

  const s = codesStore();
  const now = new Date();
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unbekannt';
  const ipKey = `ip/${await hash(ip)}/${now.toISOString().slice(0, 13)}`;
  const ipCount = (await s.get<number>(ipKey)) ?? 0;
  if (ipCount >= PER_IP_HOUR) return json(429, { error: 'Zu viele Anfragen. Bitte versuche es in einer Stunde noch einmal.' });
  await s.set(ipKey, ipCount + 1);

  // one access per e-mail: never show the existing code here, only send it by e-mail
  const eKey = await emailKey(email);
  const existing = await s.get<{ code: string }>(eKey);
  if (existing) {
    const sent = await sendMail(email, 'Dein Zugangscode für Pathfinder DE', mailText(vorname, existing.code));
    return json(409, {
      error: sent
        ? 'Für diese E-Mail gibt es schon einen Zugang. Wir haben dir den Code noch einmal geschickt.'
        : 'Für diese E-Mail gibt es schon einen Zugang. Schreib uns, wenn du deinen Code nicht mehr findest.',
    });
  }

  const limit = Math.max(1, Number(process.env.MAX_NEUE_CODES_PRO_TAG ?? 30) || 30);
  const dayKey = `tag/${now.toISOString().slice(0, 10)}`;
  const today = (await s.get<number>(dayKey)) ?? 0;
  if (today >= limit) {
    await s.set(`warteliste/${eKey.slice(6)}`, { vorname, email, zeit: now.toISOString() });
    return json(429, {
      warteliste: true,
      error: 'Für heute sind alle neuen Plätze vergeben. Du stehst auf der Warteliste, wir melden uns per E-Mail.',
    });
  }

  // a code that is neither stored nor in the env list
  const env = accessCodes();
  let code = newCode();
  for (let i = 0; i < 10 && (env.includes(canonical(code)) || (await s.get(`code/${canonical(code)}`))); i++) code = newCode();

  const rec: AccessRecord = { code, vorname, email, erstellt: now.toISOString(), zuletztBenutzt: null, gesperrt: false };
  await s.set(`code/${canonical(code)}`, rec);
  await s.set(eKey, { code });
  await s.set(dayKey, today + 1);

  const mail = mailConfigured() ? await sendMail(email, 'Dein Zugangscode für Pathfinder DE', mailText(vorname, code)) : false;
  return json(200, { ok: true, code, mail });
};

function mailText(vorname: string, code: string): string {
  return `Hallo ${vorname},

dein Zugangscode für den Pathfinder Coach lautet:

${code}

Du meldest dich hier an: ${siteUrl()}/app

Bewahre den Code gut auf. Er ist dein einziger Schlüssel, ein Passwort gibt es nicht.

Viele Grüße
Pathfinder DE`;
}

export const config = { path: '/api/zugang' };
