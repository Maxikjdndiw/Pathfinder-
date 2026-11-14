# Pathfinder – Website

Landing page for **Pathfinder**: careers, universities, scholarships and internships for ambitious students at public schools in Germany.

Built with Vite + TypeScript, plain HTML/CSS, GSAP ScrollTrigger and Three.js (lazy loaded).

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Build

```bash
npm run build
npm run preview
```

`npm run build` type-checks and writes the finished site to `dist/`. `npm run preview` serves that folder locally.

## Where to change things

| What | Where |
| --- | --- |
| Sign-up link (Google Form) | `src/config.ts` → `SIGNUP_URL` (used by every "Kostenlos mitmachen" button) |
| Page texts | `index.html` (each section is marked with a comment) |
| Impressum / Datenschutz | `impressum.html`, `datenschutz.html` (placeholders, must be filled before launch) |
| Flying cards (titles, details, colours) | `src/content/cards.ts` |
| Card photos | put files in `public/images/`, then add `image: 'images/<file>'` in `src/content/cards.ts` |
| Brand colours, fonts, spacing | `src/styles/tokens.css` |
| Founder badge (lanyard) | Card texts and artwork: `src/lanyard/founderCard.ts`. Look and physics (colours, metal, swing): the `createLanyard(...)` options in `src/main.ts`. To use a real photo or design, pass image URLs as `frontImage` / `backImage` instead. |
| Social preview image | `public/og-image.png` (1200 × 630) |
| Logo | `public/pathfinder-mark.svg` (light backgrounds), `public/pathfinder-mark-dark.svg` (dark backgrounds). The nav inlines `pathfinder-mark.svg` at build time, so replacing that file updates the nav too. |
| Favicon / app icons | `public/pathfinder-app-icon.svg`; the PNGs (`favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are rendered from it – regenerate them if the icon changes |

## How the page is built

- `src/main.ts` – sign-up links, scroll reveals, the scroll timeline of the hero, lazy loading of the 3D scene.
- `src/scene.ts` – the Three.js card scene: cards fly in, form a ring around the headline, a tilted wall, then a road into the distance. Cards are drawn in code onto canvas textures; fast cards get a chromatic blur in the shader.
- `src/glassPass.ts` – the final WebGL pass: background glows, soft bottom fade, and the real liquid glass (refraction shader) behind the nav, the hero subline and the captions while they sit over the 3D scene.
- `src/liquidGlass.ts` – liquid glass for the field tags and the nav further down the page: an SVG displacement filter used through `backdrop-filter`. Chromium only; Safari and Firefox keep the frosted glass.
- Both glass types switch back to frosted glass automatically if the frame rate drops (phones first). Add `?glass=force` to the URL to turn that guard off when testing.
- `src/lanyard/lanyard.js` – the founder badge on a lanyard, ported from the React Bits Lanyard component to plain JavaScript (no React needed). Loaded only when the founder section comes near.
- Fallback: with `prefers-reduced-motion` or without WebGL, the 3D scene is skipped and a static card grid is shown instead.
- Phones get fewer cards and a lower pixel ratio. Rendering pauses when the hero is off screen.
- Privacy: no cookies, no tracking, fonts are self-hosted (no requests to Google Fonts).

## Deploy

See the deployment notes in the project hand-over, or in short:

- **Netlify** (works with a private repo, free): connect the repo, build command `npm run build`, publish directory `dist`. `netlify.toml` already sets this.
- **GitHub Pages**: the build uses relative paths (`base: './'`), so `dist/` works in a sub-path. Note that Pages for a *private* repo needs a paid GitHub plan.
