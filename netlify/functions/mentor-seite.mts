/**
 * GET /m/<MENTOR_PFAD>: the mentor page, only at this secret address.
 * Every other address under /m/ and the old /mentor answer "not found", so nobody finds the
 * page by guessing. The password check for the data stays in mentor-admin.mts.
 * MENTOR_PFAD: at least 16 characters, letters, digits and hyphens. Without it there is no page.
 */
import { readFileSync } from 'node:fs';
import { MENTOR_HTML } from './_shared/mentor-page.generated';

const notFound = () =>
  new Response('<!doctype html><html lang="de"><meta charset="utf-8"><title>Seite nicht gefunden</title><p>Diese Seite gibt es nicht.</p></html>', {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });

/** constant time compare, so the secret cannot be found character by character */
async function same(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export default async (req: Request) => {
  const secret = process.env.MENTOR_PFAD ?? '';
  if (!/^[A-Za-z0-9-]{16,}$/.test(secret)) return notFound();
  const given = new URL(req.url).pathname.replace(/^\/m\//, '').replace(/\/$/, '');
  if (!(await same(given, secret))) return notFound();

  let html = MENTOR_HTML;
  // netlify dev before a build: the source page (the dev server serves its scripts)
  if (!html && process.env.NETLIFY_DEV === 'true') {
    try {
      html = readFileSync('mentor.html', 'utf8').replace('<!--brand-mark-->', '');
    } catch {
      html = '';
    }
  }
  if (!html) return notFound();
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      // the secret address never leaves the page as a referrer
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    },
  });
};

export const config = { path: '/m/*' };
