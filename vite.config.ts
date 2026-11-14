import { defineConfig } from 'vite';

// base: './' keeps all asset paths relative, so the build works on Netlify,
// on GitHub Pages (inside a /pathfinder-website/ sub-path) and from a plain folder.
export default defineConfig({
  base: './',
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
