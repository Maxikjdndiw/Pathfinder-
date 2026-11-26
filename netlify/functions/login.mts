/**
 * POST /api/login: checks an access code. Body { code }. Answer { ok: true, vorname } or 401.
 * vorname: the first name from the signup, empty for fixed codes; shown in the dashboard greeting.
 * Valid: codes from PATHFINDER_ACCESS_CODES and self-requested codes that are not blocked.
 */
import { normaliseCode } from './_shared/limits';
import { isAllowed, nameFor, recordActivity } from './_shared/codes';

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
  const ok = await isAllowed(code, true);
  if (ok) await recordActivity(code);
  return new Response(JSON.stringify(ok ? { ok: true, vorname: await nameFor(code) } : { error: 'Dieser Zugangscode ist nicht gültig.' }), {
    status: ok ? 200 : 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
};

export const config = { path: '/api/login' };
