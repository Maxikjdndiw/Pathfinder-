import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
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

/** /quiz serves quiz.html in dev and preview too (Netlify does it with a rewrite, see netlify.toml) */
const quizRoute = {
  name: 'quiz-route',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/quiz\/?(\?.*)?$/.test(req.url)) req.url = req.url.replace(/^\/quiz\/?/, '/quiz.html');
      next();
    });
  },
  configurePreviewServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/quiz\/?(\?.*)?$/.test(req.url)) req.url = req.url.replace(/^\/quiz\/?/, '/quiz.html');
      next();
    });
  },
};

// base: '/' (absolute asset paths) so /quiz and /quiz/ both load their assets on Netlify.
export default defineConfig({
  base: '/',
  // Writes SIGNUP_URL from src/config.ts into the HTML, so the buttons work even before JS loads.
  plugins: [
    quizRoute,
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
      },
    },
  },
});
