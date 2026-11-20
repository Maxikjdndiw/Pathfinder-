/**
 * POST /api/chat: the Pathfinder DE coach.
 * Body: { code, mode, profile, messages: [{ role, content }] }
 * Answer: a stream of JSON lines: {"t":"text"} ... then {"done":true} or {"error":"..."}.
 *
 * Models: Claude Haiku 5.5 for the chat; Claude Sonnet 5.5 only for CV reviews (mode
 * cv_linkedin with a long pasted text). The static part of the system prompt is cached.
 * Env: ANTHROPIC_API_KEY, PATHFINDER_ACCESS_CODES, PATHFINDER_DAILY_LIMIT,
 * PATHFINDER_MOCK=1 (canned answers, no API calls, for local tests).
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildSystem, MODES, type Mode, type Profile } from './_shared/prompt';
import { isValidCode, normaliseCode, takeQuota } from './_shared/limits';
import { mockReply } from './_shared/mock';

const CHAT_MODEL = 'claude-haiku-5-5';
const REVIEW_MODEL = 'claude-sonnet-5-5';
const REVIEW_MIN_CHARS = 600;
const MAX_MESSAGES = 24;
const MAX_CHARS = 6000;

type Msg = { role: 'user' | 'assistant'; content: string };

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function cleanMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as Msg['role'], content: String(m.content).slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  // the API needs the conversation to start with the student
  while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
  return msgs;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'Nur POST.' });
  let body: { code?: unknown; mode?: unknown; profile?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ungültige Anfrage.' });
  }

  const code = normaliseCode(body.code);
  if (!isValidCode(code)) return json(401, { error: 'Dieser Zugangscode ist nicht gültig.' });
  const mode: Mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : 'orientierung';
  const profile = body.profile && typeof body.profile === 'object' ? (body.profile as Profile) : null;
  const messages = cleanMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Keine Nachricht.' });

  const quota = await takeQuota(code);
  if (!quota.ok) return json(429, { error: `Du hast heute schon ${quota.limit} Nachrichten geschrieben. Morgen geht es weiter.` });

  const last = messages[messages.length - 1].content;
  const review = mode === 'cv_linkedin' && last.length >= REVIEW_MIN_CHARS;
  const encoder = new TextEncoder();
  const line = (o: object) => encoder.encode(JSON.stringify(o) + '\n');

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (process.env.PATHFINDER_MOCK === '1') {
          for (const part of mockReply(mode, messages)) {
            controller.enqueue(line({ t: part }));
            await new Promise((r) => setTimeout(r, 25));
          }
          controller.enqueue(line({ done: true, model: 'mock' }));
          return controller.close();
        }

        const client = new Anthropic();
        const system = buildSystem(mode, profile);
        // CV review on Sonnet: if a safety classifier declines, the API retries on the
        // fallback model it picks for that case (server-side fallback, "default" routing)
        const s = review
          ? client.beta.messages.stream({
              model: REVIEW_MODEL,
              max_tokens: 8000,
              output_config: { effort: 'medium' },
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
              system,
              messages,
            })
          : client.messages.stream({
              model: CHAT_MODEL,
              max_tokens: 4000,
              // short coaching replies: low effort keeps answers fast
              output_config: { effort: 'low' },
              system,
              messages,
            });

        for await (const event of s) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(line({ t: event.delta.text }));
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === 'refusal') {
          controller.enqueue(line({ error: 'Dazu kann ich leider nichts sagen. Formuliere die Frage gern anders.' }));
        } else {
          controller.enqueue(line({ done: true, model: final.model, stop: final.stop_reason }));
        }
        console.log(
          JSON.stringify({ code, mode, model: final.model, in: final.usage.input_tokens, out: final.usage.output_tokens, cacheRead: final.usage.cache_read_input_tokens ?? 0 }),
        );
      } catch (err) {
        let msg = 'Gerade klappt die Verbindung nicht. Versuch es gleich noch einmal.';
        if (err instanceof Anthropic.RateLimitError) msg = 'Gerade sind sehr viele Anfragen unterwegs. Versuch es in einer Minute noch einmal.';
        else if (err instanceof Anthropic.AuthenticationError) msg = 'Der Coach ist gerade nicht eingerichtet. Bitte sag Maxi Bescheid.';
        console.error('chat error', err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : err);
        controller.enqueue(line({ error: msg }));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/chat' };
