/**
 * Brand placeholders for the archetype card photos (900 x 1271, JPG).
 * Replace each file in public/quiz/archetypes/ with the real photo (same name),
 * see public/quiz/archetypes/CREDITS.md. Run: node scripts/archetype-placeholders.mjs
 */
import sharp from 'sharp';

const W = 900;
const H = 1271;
const INK = '#1D1D1F';
const STONE = '#FFFFFF';
const OX = '#0066CC';
const OXL = '#0066CC';
const OC = '#6E6E73';

const bg = (top, bottom) => `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<radialGradient id="glow" cx="0.7" cy="0.25" r="0.7"><stop offset="0" stop-color="${STONE}" stop-opacity="0.18"/><stop offset="1" stop-color="${STONE}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;

const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const motifs = {
  // skyline at night through a window
  dealmaker: () => {
    const r = rnd(7);
    let s = '';
    let x = 0;
    while (x < W) {
      const w = 60 + r() * 90;
      const h = 260 + r() * 520;
      s += `<rect x="${x}" y="${H - h}" width="${w - 8}" height="${h}" fill="${INK}" opacity="0.9"/>`;
      for (let yy = H - h + 24; yy < H - 20; yy += 34) for (let xx = x + 12; xx < x + w - 20; xx += 22) if (r() > 0.55) s += `<rect x="${xx}" y="${yy}" width="8" height="12" fill="${STONE}" opacity="${0.25 + r() * 0.5}"/>`;
      x += w;
    }
    return s + `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${INK}" stroke-width="60"/><line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="${INK}" stroke-width="14" opacity="0.8"/>`;
  },
  // chess board, mid game
  mastermind: () => {
    let s = `<g transform="translate(450 760) rotate(-18) skewX(-8)">`;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) s += `<rect x="${(i - 4) * 110}" y="${(j - 4) * 110}" width="110" height="110" fill="${(i + j) % 2 ? STONE : INK}" opacity="${(i + j) % 2 ? 0.16 : 0.5}"/>`;
    const pieces = [[-2, -1, STONE], [1, -2, STONE], [0, 1, OXL], [2, 0, OXL], [-1, 2, STONE]];
    for (const [i, j, c] of pieces) s += `<circle cx="${i * 110 + 55}" cy="${j * 110 + 55}" r="34" fill="${c}" opacity="0.85"/><rect x="${i * 110 + 35}" y="${j * 110 + 2}" width="40" height="40" rx="12" fill="${c}" opacity="0.85"/>`;
    return s + '</g>';
  },
  // paint and sketches on a studio table
  creator: () => {
    const r = rnd(11);
    let s = '';
    for (let k = 0; k < 7; k++) s += `<rect x="${r() * 700}" y="${r() * 1100}" width="${180 + r() * 200}" height="${240 + r() * 200}" fill="${STONE}" opacity="0.1" transform="rotate(${-20 + r() * 40} 450 600)"/>`;
    for (let k = 0; k < 9; k++) s += `<circle cx="${r() * W}" cy="${r() * H}" r="${40 + r() * 110}" fill="${[OXL, OC, STONE][k % 3]}" opacity="${0.35 + r() * 0.3}"/>`;
    for (let k = 0; k < 4; k++) s += `<path d="M${r() * W} ${r() * H} q ${200 * r()} ${-300 * r()} ${400 * r()} ${100 * r()}" stroke="${STONE}" stroke-width="${10 + r() * 16}" fill="none" stroke-linecap="round" opacity="0.5"/>`;
    return s;
  },
  // circuit board close up
  builder: () => {
    const r = rnd(5);
    let s = '';
    for (let k = 0; k < 26; k++) {
      let x = Math.round(r() * 9) * 100;
      let y = Math.round(r() * 12) * 100;
      let d = `M${x} ${y}`;
      for (let n = 0; n < 4; n++) {
        if (r() > 0.5) x += (r() > 0.5 ? 1 : -1) * 100; else y += (r() > 0.5 ? 1 : -1) * 100;
        d += ` L${x} ${y}`;
      }
      s += `<path d="${d}" stroke="${STONE}" stroke-width="6" fill="none" opacity="0.28"/><circle cx="${x}" cy="${y}" r="12" fill="${STONE}" opacity="0.6"/>`;
    }
    return s + `<rect x="300" y="460" width="300" height="300" rx="18" fill="${INK}" stroke="${STONE}" stroke-opacity="0.5" stroke-width="6"/><rect x="345" y="505" width="210" height="210" rx="10" fill="${OXL}" opacity="0.8"/>`;
  },
  // empty stage, one spotlight, a microphone
  storyteller: () =>
    `<polygon points="380,0 520,0 760,${H - 220} 140,${H - 220}" fill="${STONE}" opacity="0.13"/>
     <ellipse cx="450" cy="${H - 220}" rx="320" ry="60" fill="${STONE}" opacity="0.22"/>
     <rect x="0" y="${H - 220}" width="${W}" height="220" fill="${INK}" opacity="0.85"/>
     <line x1="450" y1="${H - 230}" x2="450" y2="${H - 560}" stroke="${STONE}" stroke-width="8" opacity="0.8"/>
     <rect x="428" y="${H - 640}" width="44" height="90" rx="22" fill="${STONE}" opacity="0.85"/>
     <path d="M400 ${H - 230} h100" stroke="${STONE}" stroke-width="10" opacity="0.8"/>`,
  // rope team on a mountain ridge, far away
  leader: () => {
    let s = `<path d="M0 ${H} L0 760 L180 620 L330 700 L520 470 L700 600 L${W} 520 L${W} ${H} Z" fill="${INK}" opacity="0.9"/>
      <path d="M0 860 L260 760 L420 820 L640 690 L${W} 760 L${W} ${H} L0 ${H} Z" fill="${INK}"/>`;
    const people = [[470, 482], [500, 492], [530, 505]];
    for (const [x, y] of people) s += `<circle cx="${x}" cy="${y - 26}" r="7" fill="${STONE}"/><rect x="${x - 5}" y="${y - 19}" width="10" height="20" rx="4" fill="${STONE}"/>`;
    return s + `<path d="M470 470 Q485 480 500 482 T530 494" stroke="${OXL}" stroke-width="3" fill="none"/>`;
  },
  // magnifying glass over a blueprint
  detective: () => {
    let s = '';
    for (let x = 0; x <= W; x += 60) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${STONE}" stroke-width="1.5" opacity="0.12"/>`;
    for (let y = 0; y <= H; y += 60) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${STONE}" stroke-width="1.5" opacity="0.12"/>`;
    s += `<path d="M120 300 h420 v260 h-200 v300 h-220 z M600 700 h180 v360 h-180 z" fill="none" stroke="${STONE}" stroke-width="4" opacity="0.35"/>`;
    return s + `<circle cx="470" cy="560" r="210" fill="${STONE}" opacity="0.08" stroke="${STONE}" stroke-width="22" stroke-opacity="0.75"/>
      <line x1="620" y1="710" x2="820" y2="910" stroke="${OXL}" stroke-width="46" stroke-linecap="round"/>`;
  },
  // long table seen from above, many plates
  connector: () => {
    let s = `<rect x="300" y="-20" width="300" height="${H + 40}" rx="20" fill="${STONE}" opacity="0.12"/>`;
    for (let y = 80; y < H; y += 170) {
      for (const x of [370, 530]) s += `<circle cx="${x}" cy="${y}" r="52" fill="none" stroke="${STONE}" stroke-width="8" opacity="0.55"/><circle cx="${x}" cy="${y}" r="26" fill="${STONE}" opacity="0.18"/>`;
      s += `<circle cx="240" cy="${y + 10}" r="34" fill="${OXL}" opacity="0.6"/><circle cx="660" cy="${y - 10}" r="34" fill="${OC}" opacity="0.6"/>`;
    }
    return s;
  },
};

const palettes = {
  dealmaker: ['#3A3A3C', INK],
  mastermind: ['#3A3A3C', INK],
  creator: ['#004F9E', INK],
  builder: ['#3A3A3C', INK],
  storyteller: ['#3A3A3C', INK],
  leader: ['#6E6E73', INK],
  detective: ['#3A3A3C', INK],
  connector: ['#3A3A3C', INK],
};

for (const [slug, draw] of Object.entries(motifs)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg(...palettes[slug])}${draw()}</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/quiz/archetypes/${slug}.jpg`);
  console.log(`placeholder ${slug}.jpg`);
}
