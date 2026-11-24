/**
 * E-mail via Resend (https://resend.com). Settings, all optional:
 *   MAIL_API_KEY   the Resend API key
 *   MAIL_ABSENDER  sender, for example "Pathfinder DE <hello@mypathfinder.site>" (domain verified in Resend)
 *   MENTOR_MAIL_AN where new mentor requests go
 * Without MAIL_API_KEY nothing is sent and sendMail returns false; everything else keeps working.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.MAIL_API_KEY;
  if (!key || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_ABSENDER || 'Pathfinder DE <onboarding@resend.dev>',
        to: [to],
        subject,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const mailConfigured = () => Boolean(process.env.MAIL_API_KEY);

/** The site address for links in e-mails (Netlify sets URL) */
export const siteUrl = () => process.env.URL || 'http://localhost:8888';

/** link to the mentor page for the mentor's own e-mails (secret address, see mentor-seite.mts) */
export const mentorUrl = () => (process.env.MENTOR_PFAD ? `${siteUrl()}/m/${process.env.MENTOR_PFAD}` : `${siteUrl()} (Mentorenbereich: MENTOR_PFAD fehlt noch)`);

