/**
 * Hero trail: one thin line that winds across the right side of the hero, with 12 stops
 * spaced evenly by distance along it. The stops are plain HTML in index.html; this module
 * builds the path for the current box size and places each stop on it.
 *
 * - Trail shape: TRAIL_POINTS below (x and y as shares of the trail box, 0 to 1).
 * - Pills alternate sides of the line, so neighbours never sit next to each other.
 * - Below 1100px wide the trail is hidden and the stops wrap in a row (CSS only).
 * - Drawing and fade in are CSS animations; prefers-reduced-motion turns them off.
 */
import './hero-trail.css';

/** Trail shape: points the smooth line passes through, from near the text to the top right. */
export const TRAIL_POINTS: [number, number][] = [
  [0.0, 0.93],
  [0.28, 0.93],
  [0.52, 0.83],
  [0.68, 0.68],
  [0.5, 0.55],
  [0.3, 0.45],
  [0.38, 0.29],
  [0.6, 0.21],
  [0.72, 0.06],
];

/** gap between a dot and its pill (px) */
const GAP = 20;
/** how long the line takes to draw (s); keep in sync with --trail-draw in hero-trail.css */
const DRAW_SECONDS = 4;

/** Smooth path through the points (Catmull-Rom as cubic Beziers). */
function smoothPath(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function initHeroTrail(root: HTMLElement): void {
  const svg = root.querySelector<SVGSVGElement>('.trail__svg');
  const path = root.querySelector<SVGPathElement>('.trail__path');
  const stops = [...root.querySelectorAll<HTMLElement>('.stop')];
  if (!svg || !path || !stops.length) return;
  const wide = window.matchMedia('(min-width: 1100px)');

  const layout = () => {
    if (!wide.matches) {
      root.classList.remove('is-placed');
      stops.forEach((li) => {
        li.removeAttribute('data-side');
        li.style.left = li.style.top = '';
        const pill = li.querySelector<HTMLElement>('.stop__pill')!;
        pill.style.left = pill.style.top = '';
      });
      return;
    }
    const w = root.clientWidth;
    const h = root.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    path.setAttribute('d', smoothPath(TRAIL_POINTS.map(([x, y]) => [x * w, y * h])));
    const total = path.getTotalLength();
    const box = root.getBoundingClientRect();
    // things the pills must keep clear of, in trail box coordinates
    const avoid = [...document.querySelectorAll<HTMLElement>('.hero__text > *')].map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top };
    });
    const navBottom = (document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 0) - box.top;
    const minX = 8 - box.left;
    const maxX = window.innerWidth - 8 - box.left;
    const points = stops.map((_, i) => {
      const s = (total * (i + 0.5)) / stops.length; // evenly spaced by distance, never at the ends
      return { s, p: path.getPointAtLength(s) };
    });
    const dots = points.map(({ p }) => ({ l: p.x - 8, r: p.x + 8, t: p.y - 8, b: p.y + 8 }));
    type Box = { l: number; r: number; t: number; b: number };
    const gap = (a: Box, c: Box) => Math.max(c.l - a.r, a.l - c.r, c.t - a.b, a.t - c.b);
    const placed: Box[] = [];

    stops.forEach((li, i) => {
      const { s, p } = points[i];
      const a = path.getPointAtLength(Math.max(0, s - 3));
      const b = path.getPointAtLength(Math.min(total, s + 3));
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      // normal to the line, flipped every other stop so pills alternate sides
      const side = i % 2 === 0 ? -1 : 1;
      const nx = (-(b.y - a.y) / len) * side;
      const ny = ((b.x - a.x) / len) * side;
      li.style.left = `${p.x}px`;
      li.style.top = `${p.y}px`;
      li.style.setProperty('--t', `${((s / total) * DRAW_SECONDS).toFixed(2)}s`);
      const pill = li.querySelector<HTMLElement>('.stop__pill')!;
      const pw = pill.offsetWidth;
      const ph = pill.offsetHeight;
      // candidate spots, all on this stop's side of the line: beside, above or below, corner
      const sx = nx >= 0 ? 1 : -1;
      const sy = ny >= 0 ? 1 : -1;
      const beside = { x: sx > 0 ? GAP : -GAP - pw, y: -ph / 2 };
      const vert = { x: -pw / 2, y: sy > 0 ? GAP : -GAP - ph };
      const corner = { x: sx > 0 ? GAP * 0.4 : -GAP * 0.4 - pw, y: sy > 0 ? GAP * 0.4 : -GAP * 0.4 - ph };
      const options = Math.abs(nx) >= Math.abs(ny) ? [beside, corner, vert] : [vert, corner, beside];
      // score each spot by its clear space at hover size (scale 1.08), keep the best
      let best = options[0];
      let bestScore = -Infinity;
      options.forEach((o, k) => {
        const cx = p.x + o.x + pw / 2;
        const cy = p.y + o.y + ph / 2;
        const r = { l: cx - pw * 0.54, r: cx + pw * 0.54, t: cy - ph * 0.54, b: cy + ph * 0.54 };
        let score = Infinity;
        placed.forEach((q) => (score = Math.min(score, gap(r, q))));
        dots.forEach((d, j) => j !== i && (score = Math.min(score, gap(r, d) + 20)));
        avoid.forEach((t) => (score = Math.min(score, gap(r, t))));
        score = Math.min(score, r.l - minX + 24, maxX - r.r + 24, r.t - navBottom + 16);
        score -= k * 2; // slight preference for the natural spot
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      });
      pill.style.left = `${best.x}px`;
      pill.style.top = `${best.y}px`;
      const cx = p.x + best.x + pw / 2;
      const cy = p.y + best.y + ph / 2;
      placed.push({ l: cx - pw * 0.54, r: cx + pw * 0.54, t: cy - ph * 0.54, b: cy + ph * 0.54 });
    });
    root.classList.add('is-placed');
  };

  // a tap focuses the pill, so touch gets the same highlight as hover and keyboard
  stops.forEach((li) => {
    const pill = li.querySelector<HTMLElement>('.stop__pill')!;
    pill.addEventListener('pointerdown', () => pill.focus({ preventScroll: true }));
  });

  layout();
  new ResizeObserver(layout).observe(root);
  wide.addEventListener('change', layout);
  // fonts change the pill widths: place again once they are ready
  document.fonts?.ready.then(layout);
}
