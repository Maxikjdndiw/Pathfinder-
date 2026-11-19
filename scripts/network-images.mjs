/**
 * Images for the "Netzwerk" sphere tiles. Run: npm run network-images
 *
 * 1. Photo tiles: reuse the path-card originals in assets/card-photos/ (never moved or renamed),
 *    crop a square around the subject, duotone in the SAME variant colour as the matching card,
 *    1024 x 1024 WebP (< 150 KB) → public/images/network/<slug>.webp
 * 2. Placeholder tiles: abstract SVGs in the theme colours (no text, logos or people)
 *    → public/images/network/<name>.svg. Replace them later; only src/data/networkTiles.ts
 *    has to change.
 */
import { statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { duotone } from './lib/duotone.mjs';

const OUT = 'public/images/network';
const SIZE = 1024;

// tile slug → [original in assets/card-photos, variant of the matching path card]
const PHOTOS = {
  finance: ['finance.jpg', 'oxblood'],
  design: ['design.jpg', 'ocean'],
  mode: ['mode.jpg', 'card'],
  tech: ['tech.jpg', 'ocean'],
  'city-mailand': ['bocconi.jpg', 'card'],
  'city-london': ['kings-college.jpg', 'card'],
};

// tile photos supplied for the Netzwerk only (assets/network-photos/<slug>.jpg)
const NETWORK_PHOTOS = {
  'field-marketing': 'oxblood',
  'field-recht': 'ink',
  'city-madrid': 'ocean',
  'city-amsterdam': 'ink',
  'activity-buddies': 'oxblood',
  'activity-mock-interview': 'ocean',
  'activity-essay': 'card',
  'activity-stipendien': 'ink',
};
for (const [slug, variant] of Object.entries(NETWORK_PHOTOS)) PHOTOS[slug] = [`../network-photos/${slug}.jpg`, variant];

for (const [slug, [file, variant]] of Object.entries(PHOTOS)) {
  // 'attention' keeps the most detailed region (the subject) when cropping to a square
  const pipeline = sharp(`assets/card-photos/${file}`)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention });
  let q = 78;
  const img = await duotone(pipeline, variant);
  const buf = await img.webp({ quality: q }).toBuffer();
  let out = buf;
  while (out.length > 150 * 1024 && q > 50) {
    q -= 6;
    out = await (await duotone(sharp(`assets/card-photos/${file}`).rotate().resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention }), variant)).webp({ quality: q }).toBuffer();
  }
  writeFileSync(`${OUT}/${slug}.webp`, out);
  console.log(`photo ${slug}.webp ${variant} q${q} ${Math.round(out.length / 1024)} KB`);
}

/* ---------- placeholders: one style, abstract shapes, theme colours ---------- */
const C = { stone: '#FFFFFF', card: '#FFFFFF', ink: '#141517', ox: '#7A1F2E', oxD: '#6B1A27', oxL: '#8A2636', oc: '#1B2F52', ocL: '#6F84A8' };

const frame = (bg1, bg2, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
<radialGradient id="hl" cx="0.25" cy="0.15" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>${body}<rect width="${SIZE}" height="${SIZE}" fill="url(#hl)"/>
</svg>`;

// shared vocabulary: big circles, rounded rectangles, one thin "path" line
const path = (stroke, d) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>`;

const PLACEHOLDERS = {
  // Marketing: concentric rings, like a signal spreading out
  'field-marketing': frame(C.oxD, C.oxL, `
    ${[420, 320, 220, 120].map((r, i) => `<circle cx="512" cy="560" r="${r}" fill="none" stroke="${C.card}" stroke-width="${14 - i * 2}" opacity="${0.18 + i * 0.12}"/>`).join('')}
    <circle cx="512" cy="560" r="60" fill="${C.card}" opacity="0.85"/>
    ${path(C.ocL, 'M120 860 C 320 760, 420 700, 512 560')}`),
  // Recht & Politik: a balanced beam with two plates (abstract)
  'field-recht': frame('#1d1e21', C.ink, `
    <rect x="502" y="260" width="20" height="520" rx="10" fill="${C.card}" opacity="0.8"/>
    <rect x="232" y="330" width="560" height="20" rx="10" fill="${C.card}" opacity="0.8"/>
    <circle cx="282" cy="560" r="120" fill="${C.ox}" opacity="0.9"/><circle cx="742" cy="560" r="120" fill="${C.card}" opacity="0.35"/>
    <rect x="372" y="780" width="280" height="36" rx="18" fill="${C.card}" opacity="0.6"/>`),
  // Madrid: warm sun over stepped blocks
  'city-madrid': frame(C.oc, '#142540', `
    <circle cx="700" cy="330" r="150" fill="${C.card}" opacity="0.85"/>
    ${[[80, 640, 220, 384], [300, 540, 200, 484], [500, 600, 180, 424], [680, 500, 260, 524]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${C.ink}" opacity="0.55"/>`).join('')}
    ${path(C.ocL, 'M60 900 C 300 860, 600 940, 980 880')}`),
  // Amsterdam: narrow gabled houses over a canal line
  'city-amsterdam': frame('#1d1e21', C.ink, `
    ${[0, 1, 2, 3, 4].map((i) => { const x = 150 + i * 150; const h = 380 + (i % 2) * 70; return `<path d="M${x} ${760} V${760 - h} L${x + 60} ${700 - h} L${x + 120} ${760 - h} V760 Z" fill="${[C.card, C.card, C.ox, C.card, C.card][i]}" opacity="${i === 2 ? 0.95 : 0.22 + i * 0.08}"/>`; }).join('')}
    ${[0, 1, 2].map((i) => `<rect x="${120 + i * 60}" y="${800 + i * 40}" width="${780 - i * 120}" height="10" rx="5" fill="${C.ocL}" opacity="${0.7 - i * 0.2}"/>`).join('')}`),
  // Bewerbungs-Buddies: two shapes side by side, overlapping
  'activity-buddies': frame(C.oxD, C.oxL, `
    <circle cx="400" cy="520" r="230" fill="${C.card}" opacity="0.88"/>
    <circle cx="640" cy="520" r="230" fill="${C.oc}" opacity="0.8"/>
    ${path(C.card, 'M150 860 C 380 800, 640 800, 880 860')}`),
  // Mock Interviews: two speech-like rounded shapes facing each other
  'activity-mock-interview': frame(C.oc, '#142540', `
    <rect x="120" y="260" width="460" height="300" rx="150" fill="${C.card}" opacity="0.9"/>
    <path d="M220 540 L190 640 L320 555 Z" fill="${C.card}" opacity="0.9"/>
    <rect x="444" y="520" width="460" height="300" rx="150" fill="${C.ink}" opacity="0.75"/>
    <path d="M804 800 L834 900 L704 815 Z" fill="${C.ink}" opacity="0.75"/>`),
  // Essay-Feedback: a sheet with lines and one marked line
  'activity-essay': frame(C.card, C.stone, `
    <rect x="252" y="170" width="520" height="690" rx="28" fill="#ffffff" stroke="#CFCDC7" stroke-width="6" transform="rotate(-4 512 512)"/>
    <g transform="rotate(-4 512 512)">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="312" y="${270 + i * 74}" width="${i === 6 ? 220 : 400}" height="16" rx="8" fill="${C.ink}" opacity="0.18"/>`).join('')}
      <rect x="300" y="${270 + 3 * 74 - 14}" width="424" height="44" rx="14" fill="${C.ox}" opacity="0.2"/>
      <circle cx="760" cy="${270 + 3 * 74 + 8}" r="22" fill="${C.ox}"/></g>
    ${path(C.oc, 'M120 900 C 360 860, 640 940, 920 880')}`),
  // Stipendien & Fristen: a calendar grid with one marked day and a ring
  'activity-stipendien': frame('#1d1e21', C.ink, `
    ${Array.from({ length: 20 }, (_, i) => { const x = 210 + (i % 5) * 126; const y = 330 + Math.floor(i / 5) * 126; return `<rect x="${x}" y="${y}" width="96" height="96" rx="18" fill="${i === 12 ? C.ox : C.card}" opacity="${i === 12 ? 1 : 0.16}"/>`; }).join('')}
    <rect x="210" y="210" width="600" height="70" rx="20" fill="${C.oc}" opacity="0.85"/>
    <circle cx="${210 + 2 * 126 + 48}" cy="${330 + 2 * 126 + 48}" r="86" fill="none" stroke="${C.card}" stroke-width="8" opacity="0.8"/>`),
};

// Placeholders are no longer written: every tile has a photo now. PLACEHOLDERS stays as a reference.
void PLACEHOLDERS;
void statSync;
