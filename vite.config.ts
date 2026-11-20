import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SIGNUP_URL } from './src/config';

/**
 * Inline copy of public/pathfinder-mark.svg for the nav, so the compass needle can move on
 * hover. Shapes and colours stay exactly as in the file; the north and south points are only
 * grouped as the "needle".
 */
function brandMark(): string {
  let svg = readFileSync(new URL('./public/pathfinder-mark.svg', import.meta.url), 'utf8').trim();
  const north = /<path d="M32 3 L37 32 L27 32 Z"[^>]*><\/path>/;
  const south = /<path d="M32 61 L37 32 L27 32 Z"[^>]*><\/path>/;
  const n = svg.match(north)?.[0];
  const s = svg.match(south)?.[0];
  if (!n || !s) throw new Error('pathfinder-mark.svg: needle paths not found');
  svg = svg.replace(n, '').replace(s, `<g class="brand__needle">${n}${s}</g>`);
  return svg
    .replace(/\s(width|height|role|aria-label)="[^"]*"/g, '')
    .replace('<svg ', '<svg class="brand__mark" aria-hidden="true" focusable="false" ');
}

/** /quiz and /app serve their HTML files in dev and preview too (Netlify does it with rewrites, see netlify.toml) */
type Mw = { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } };
const pageRoutes = (server: Mw) => {
  server.middlewares.use((req, _res, next) => {
    if (req.url) req.url = req.url.replace(/^\/(quiz|app)\/?(?=\?|$)/, '/$1.html');
    next();
  });
};
const quizRoute = { name: 'page-routes', configureServer: pageRoutes, configurePreviewServer: pageRoutes };

/**
 * npm run dev: /api/chat and /api/login run the Netlify Functions in-process, so the coach
 * works without the Netlify CLI. Env vars come from the shell (for example PATHFINDER_MOCK=1).
 */
const FUNCTIONS: Record<string, string> = { '/api/chat': '/netlify/functions/chat.mts', '/api/login': '/netlify/functions/login.mts' };
const localFunctions = {
  name: 'local-functions',
  configureServer(server: {
    ssrLoadModule: (id: string) => Promise<Record<string, unknown>>;
    middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
  }) {
    // the functions read their settings from process.env, as on Netlify: take them from a
    // local .env file too (server side only, never sent to the browser)
    for (const [k, v] of Object.entries(loadEnv('development', process.cwd(), ''))) process.env[k] ??= v;
    server.middlewares.use(async (req, res, next) => {
      const file = FUNCTIONS[(req.url ?? '').split('?')[0]];
      if (!file) return next();
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const handler = (await server.ssrLoadModule(file)).default as (r: Request) => Promise<Response>;
      const response = await handler(
        new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }),
      );
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (!response.body) return res.end();
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    });
  },
};

// base: '/' (absolute asset paths) so /quiz and /quiz/ both load their assets on Netlify.
export default defineConfig({
  base: '/',
  // Writes SIGNUP_URL from src/config.ts into the HTML, so the buttons work even before JS loads.
  plugins: [
    quizRoute,
    localFunctions,
    {
      name: 'signup-url',
      transformIndexHtml: (html) => html.replaceAll('%SIGNUP_URL%', SIGNUP_URL).replaceAll('<!--brand-mark-->', brandMark()),
    },
  ],
  build: {
    target: 'es2020',
    // three.js is ~530 kB but lazy loaded after the first screen
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: 'index.html',
        impressum: 'impressum.html',
        datenschutz: 'datenschutz.html',
        quiz: 'quiz.html',
        app: 'app.html',
      },
    },
  },
});
