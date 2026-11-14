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

// base: './' keeps all asset paths relative, so the build works on Netlify,
// on GitHub Pages (inside a /pathfinder-website/ sub-path) and from a plain folder.
export default defineConfig({
  base: './',
  // Writes SIGNUP_URL from src/config.ts into the HTML, so the buttons work even before JS loads.
  plugins: [
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
      },
    },
  },
});
