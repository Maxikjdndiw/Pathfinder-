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
| Impressum / Datenschutz | `impressum.html`, `datenschutz.html` |
| Hero card stack (4 cards) | Markup and labels: `.hero-stack` in `index.html`. Photos: originals in `assets/card-photos/`, run `npm run hero-cards` (duotone, into `public/images/hero/`) |
| Hero contour map | Live version: `src/components/topography.ts`. Static fallback: `npm run topography-svg` writes `public/images/topography.svg` |
| Brand colours, fonts, spacing | `src/styles/tokens.css` |
| Founder badge (lanyard) | Card texts and artwork: `src/lanyard/founderCard.ts`. Look and physics (colours, metal, swing): the `createLanyard(...)` options in `src/main.ts`. To use a real photo or design, pass image URLs as `frontImage` / `backImage` instead. |
| Insider-Tipps cards | Real cards first: `src/content/mentors.ts` (name, role, field, short tips, accent). Placeholders fill up to 6: `src/content/insiders.ts`. |
| Social preview image | `public/og-image.png` (1200 × 630) |
| Logo | `public/pathfinder-mark.svg` (light backgrounds), `public/pathfinder-mark-dark.svg` (dark backgrounds). The nav inlines `pathfinder-mark.svg` at build time, so replacing that file updates the nav too. |
| Favicon / app icons | `public/pathfinder-app-icon.svg`; the PNGs (`favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are rendered from it – regenerate them if the icon changes |

## How the page is built

- `src/main.ts`: sign-up links, scroll reveals, the hero card stack and its scroll transition (GSAP ScrollTrigger), lazy loading of the heavier parts.
- `src/components/card-swap.ts`: the hero card stack (React Bits Card Swap, rebuilt in plain TypeScript with GSAP): every 4 s the front card drops to the back; pauses on hover, off screen and in a hidden tab; static with reduced motion.
- `src/components/topography.ts`: the contour map behind the hero and "Für wen" (React Bits Topography, rebuilt as one small WebGL shader, no Three.js). Rises gently under the mouse, slow drift on touch, max pixel ratio 1.5, pauses off screen. Without WebGL or with reduced motion the static `public/images/topography.svg` is shown.
- `src/liquidGlass.ts`: liquid glass for the field tags: an SVG displacement filter used through `backdrop-filter`. Chromium only; Safari and Firefox keep the frosted glass. Switches back to frosted glass if the frame rate drops on phones.
- `src/cardSwap.ts` – the swapping card stack in Insider-Tipps (React Bits CardSwap, ported to TypeScript). Drag or fling the front card, click a card behind, use the arrow buttons or arrow keys; it swaps on its own every 5 s and pauses on hover.
- `src/borderGlow.ts` – the edge glow on the step cards, the ocean-section cards and the tip card (React Bits BorderGlow, adapted to brand colours).
- `src/lanyard/lanyard.js` – the founder badge on a lanyard, ported from the React Bits Lanyard component to plain JavaScript (no React needed). Loaded only when the founder section comes near.
- Privacy: no cookies, no tracking, fonts are self-hosted (no requests to Google Fonts).

## Deploy

See the deployment notes in the project hand-over, or in short:

- **Netlify** (works with a private repo, free): connect the repo, build command `npm run build`, publish directory `dist`. `netlify.toml` already sets this.
- **GitHub Pages**: the build uses relative paths (`base: './'`), so `dist/` works in a sub-path. Note that Pages for a *private* repo needs a paid GitHub plan.
