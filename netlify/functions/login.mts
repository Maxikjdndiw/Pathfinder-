/** POST /api/login: checks an access code. Body { code }. Answer { ok: true } or 401. */
import { isValidCode, normaliseCode } from './_shared/limits';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Nur POST.', { status: 405 });
  let code = '';
  try {
    code = normaliseCode((await req.json()).code);
  } catch {
    /* empty or broken body: treated as a wrong code */
  }
  // a small delay makes guessing codes slow
  await new Promise((r) => setTimeout(r, 400));
  const ok = isValidCode(code);
  return new Response(JSON.stringify(ok ? { ok: true } : { error: 'Dieser Zugangscode ist nicht gültig.' }), {
    status: ok ? 200 : 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const config = { path: '/api/login' };
