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
| Hero trail and stops | Stop labels: the `.stop` list in `index.html` (hero section). Trail shape: `TRAIL_POINTS` in `src/components/hero-trail.ts`. Pill and line colours: `src/components/hero-trail.css`. Map and grain: `.hero__map` and `.hero::after` (`--grain`) in `src/styles/sections.css` |
| Hero contour map | Live version: `src/components/topography.ts`. Static fallback: `npm run topography-svg` writes `public/images/topography.svg` |
| Brand colours, fonts, spacing | `src/styles/tokens.css` |
| Founder badge (lanyard) | Card texts and artwork: `src/lanyard/founderCard.ts`. Look and physics (colours, metal, swing): the `createLanyard(...)` options in `src/main.ts`. To use a real photo or design, pass image URLs as `frontImage` / `backImage` instead. |
| Insider-Tipps cards | `src/content/mentors.ts` (name, role, field, short tips, accent). Only real cards; counter and arrows follow their number, one card shows no arrows. |
| Social preview image | `public/og-image.png` (1200 × 630) |
| Logo | `public/pathfinder-mark.svg` (light backgrounds), `public/pathfinder-mark-dark.svg` (dark backgrounds). The nav inlines `pathfinder-mark.svg` at build time, so replacing that file updates the nav too. |
| Favicon / app icons | `public/pathfinder-app-icon.svg`; the PNGs (`favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) are rendered from it – regenerate them if the icon changes |

## How the page is built

- `src/main.ts`: sign-up links, scroll reveals, the hero trail and its scroll transition (GSAP ScrollTrigger), lazy loading of the heavier parts.
- `src/components/hero-trail.ts`: the hero trail. Builds the line from `TRAIL_POINTS`, spaces the 12 stops evenly along it and places each pill on alternating sides where it has the most clear space. Below 1100px the trail and stops are hidden.
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

## Coach (/app)

A chat coach for pilot participants at `/app` (file `app.html`, code in `src/app/` and `netlify/functions/`).

- **Content:** everything the coach knows comes from `app-data/` (prompt, knowledge block, field profiles, templates, offers list). After editing those files, run `npm run app-data` (the build does it too). It writes `netlify/functions/_shared/data.generated.ts`; never edit that file by hand.
- **Offers:** the coach never invents offers. It sends a marker with fields and stage, and the page filters `app-data/angebote.json` into cards.
- **Models:** Claude Haiku 5.5 for the chat, Claude Sonnet 5.5 only for CV reviews (Lebenslauf mode with a long pasted text). The static part of the prompt is cached.
- **Netlify environment variables** (Site configuration, Environment variables):
  - `ANTHROPIC_API_KEY`: the API key.
  - `PATHFINDER_ACCESS_CODES`: comma separated access codes in the form `ABCD-1234` (the login has 8 slots, see `src/app/code-slots.ts`), for example `LENA-4821,PILO-0193`.
  - `PATHFINDER_DAILY_LIMIT`: messages per code and day (default 60).
  - `MENTOR_PASSWORT`: password for the mentor area, checked on the server (10 wrong tries per address and 15 minutes, then a pause). Without it the mentor area stays closed.
  - `MENTOR_PFAD`: secret address of the mentor area (at least 16 characters). The page exists only at `/m/<MENTOR_PFAD>` (function `mentor-seite`); the build removes `mentor.html` from `dist/`, so `/mentor` does not exist.
  - Optional mail via Resend: `MAIL_API_KEY`, `MENTOR_MAIL_AN` (where new requests go), `MAIL_ABSENDER` (verified sender).
  - `MAX_NEUE_CODES_PRO_TAG`: new self-requested codes per day (default 30), then a waiting list.
- **Local test without cost:** `PATHFINDER_MOCK=1 PATHFINDER_ACCESS_CODES=TEST-1234 npm run dev`, then open `/app` and use the code `TEST-1234`. The coach answers with fixed test replies and makes no API calls. Without `PATHFINDER_MOCK` and with `ANTHROPIC_API_KEY` set, the same command talks to the real API.
- **Memory:** profile, AI chat history and saved offers stay in the student's browser. In Netlify Blobs: message counts per code and day, self-requested codes (first name, e-mail, dates), and mentor threads.
- **Access codes:** anyone can request a code at `/app#zugang` (function `zugang`: honeypot, 3 per IP and hour, one per e-mail, daily cap). Valid are env codes plus stored codes that are not blocked (`netlify/functions/_shared/codes.ts`).
- **Mentor chat:** the slider "Mit einem Menschen sprechen" sends the AI summary to `mentor-anfrage`; this opens a direct thread (student and mentor only, the AI never writes there). The chat polls `mentor-nachrichten` every 6 seconds. The mentor answers on the mentor page at `/m/<MENTOR_PFAD>` (`mentor-admin`). If the function fails, the request goes silently to the hidden Netlify form `mentor-anfrage` as a backup.
- **Without Blobs** (plain `npm run dev`) the store falls back to memory, so data is lost on restart. `netlify dev` uses a local Blobs sandbox.
