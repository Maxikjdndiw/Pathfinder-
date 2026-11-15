/**
 * Artwork for the founder lanyard, painted in code so it uses the site's own fonts,
 * colours and logo. Swap any of these for real images later (e.g. a photo on the front)
 * by passing an image URL instead.
 */
const C = {
  stone: '#E8E7E3',
  card: '#F4F2EE',
  line: '#CFCDC7',
  ink: '#141517',
  inkMuted: '#5E5F63',
  oxblood: '#6A1311',
  oxbloodDark: '#5F0F0C',
  oxbloodLight: '#741714',
};
const DISPLAY = '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif';
const BODY = 'Inter, system-ui, sans-serif';

const loadImg = (src: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });

function spaced(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      out.push(line);
      line = w;
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** Card faces are 1024 x 1440 (the lanyard's portrait card is 1.6 x 2.25). The top ~170px hold the slot. */
const W = 1024;
const H = 1440;
const PAD = 96;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function front(photo: HTMLImageElement | null): string {
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);

  // photo fills the front (cover); natural colours, no filter.
  // Anchored a little above centre, so the face stays fully visible below the lanyard slot.
  if (photo) {
    const s = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
    const w = photo.naturalWidth * s;
    const h = photo.naturalHeight * s;
    ctx.drawImage(photo, (W - w) / 2, (H - h) * 0.3, w, h);
  }

  // soft dark gradient at the bottom for the text
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
  g.addColorStop(0, 'rgba(20,21,23,0)');
  g.addColorStop(0.45, 'rgba(20,21,23,0.55)');
  g.addColorStop(1, 'rgba(20,21,23,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  ctx.textBaseline = 'alphabetic';
  // label
  ctx.font = `500 30px ${BODY}`;
  spaced(ctx, 2.4);
  ctx.fillStyle = C.stone;
  ctx.fillRect(PAD, 1018, 48, 3);
  ctx.fillText('GRÜNDER', PAD + 70, 1030);

  // name
  ctx.font = `700 150px ${DISPLAY}`;
  spaced(ctx, -4);
  ctx.fillText('Maxi', PAD - 6, 1170);

  // lines
  ctx.font = `500 44px ${BODY}`;
  spaced(ctx, 0);
  ctx.fillText('IB Schüler, Schule Louisenlund', PAD, 1236);
  ctx.globalAlpha = 0.85;
  ctx.fillText('Schleswig', PAD, 1290);
  ctx.globalAlpha = 1;

  // hint with arrow
  const by = H - 106;
  ctx.strokeStyle = 'rgba(232,231,227,0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(PAD, by);
  ctx.lineTo(W - PAD, by);
  ctx.stroke();
  ctx.font = `500 28px ${BODY}`;
  spaced(ctx, 1.5);
  ctx.fillStyle = C.stone;
  ctx.fillText('UMDREHEN FÜR MEHR', PAD, by + 58);
  ctx.strokeStyle = C.stone;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W - PAD - 52, by + 46);
  ctx.lineTo(W - PAD, by + 46);
  ctx.moveTo(W - PAD - 18, by + 30);
  ctx.lineTo(W - PAD, by + 46);
  ctx.lineTo(W - PAD - 18, by + 62);
  ctx.stroke();
  return c.toDataURL('image/png');
}

function back(markDark: HTMLImageElement | null): string {
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.oxbloodDark);
  g.addColorStop(1, C.oxbloodLight);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // dark background → dark version of the mark
  if (markDark) ctx.drawImage(markDark, PAD - 12, 250, 150, 150);

  ctx.fillStyle = C.card;
  ctx.font = `700 92px ${DISPLAY}`;
  spaced(ctx, -2.5);
  ctx.fillText('Kurz und knapp', PAD - 3, 560);

  ctx.font = `400 42px ${BODY}`;
  spaced(ctx, 0);
  let y = 700;
  for (const item of ['Geboren in Querétaro, Mexiko. Aufgewachsen in Schleswig.', 'Spricht Deutsch, Spanisch und Englisch.']) {
    ctx.fillRect(PAD, y - 16, 14, 14);
    for (const l of wrap(ctx, item, W - PAD * 2 - 44)) {
      ctx.fillText(l, PAD + 44, y);
      y += 58;
    }
    y += 40;
  }
  return c.toDataURL('image/png');
}

/** Wide strip; the lanyard repeats it along the band, its height spans the band width. */
function strap(markDark: HTMLImageElement | null): string {
  const h = 160;
  const unit = 760;
  const [c, ctx] = canvas(unit, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, C.oxbloodDark);
  g.addColorStop(1, C.oxbloodLight);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, unit, h);
  if (markDark) ctx.drawImage(markDark, 60, h / 2 - 40, 80, 80);
  ctx.fillStyle = C.card;
  ctx.font = `700 64px ${DISPLAY}`;
  spaced(ctx, 1);
  ctx.textBaseline = 'middle';
  ctx.fillText('PATHFINDER', 170, h / 2 + 3);
  return c.toDataURL('image/png');
}

export async function founderArtwork() {
  await Promise.race([
    Promise.all([
      document.fonts.load(`700 64px ${DISPLAY}`),
      document.fonts.load(`400 32px ${BODY}`),
      document.fonts.load(`500 32px ${BODY}`),
    ]),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  const base = import.meta.env.BASE_URL;
  // founder photo: WebP first, JPG as fallback (same files as the <picture> in index.html)
  const photo = (await loadImg(`${base}images/founder.webp`)) ?? (await loadImg(`${base}images/founder.jpg`));
  const markDark = await loadImg(`${base}pathfinder-mark-dark.svg`);
  return { frontImage: front(photo), backImage: back(markDark), strapImage: strap(markDark) };
}
