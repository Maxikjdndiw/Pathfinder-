// Static contour map for the hero background (shown without WebGL or with reduced motion).
// Same noise field as src/components/topography.ts, traced once with marching squares.
// Run: npm run topography-svg  ->  public/images/topography.svg
import { writeFileSync } from 'node:fs';

const W = 1600;
const H = 1400;
const STEP = 7;
const LEVELS = 26;

const fract = (x) => x - Math.floor(x);
function hash(x, y) {
  let px = fract(x * 123.34);
  let py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy;
}
function fbm(x, y) {
  let v = 0, a = 0.55;
  for (let i = 0; i < 4; i++) {
    v += a * noise(x, y);
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 9.2;
    a *= 0.5;
  }
  return v;
}

const cols = Math.ceil(W / STEP) + 1;
const rows = Math.ceil(H / STEP) + 1;
const field = new Float64Array(cols * rows);
for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) field[j * cols + i] = fbm((i * STEP) / 460, (j * STEP) / 460) * LEVELS;

const r1 = (n) => Math.round(n * 2) / 2;
// Ramer-Douglas-Peucker: drop points that sit within tol px of the line
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) {
    // closed loop: split at the point farthest from the start
    let far = 1, fd = 0;
    pts.forEach((q, i) => { const d = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
    if (far === 0 || far === pts.length - 1) return pts;
    return [...rdp(pts.slice(0, far + 1), tol).slice(0, -1), ...rdp(pts.slice(far), tol)];
  }
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), tol).slice(0, -1), ...rdp(pts.slice(idx), tol)];
}
const paths = { minor: [], major: [] };
for (let lv = 1; lv < LEVELS; lv++) {
  const segs = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const v = [field[j * cols + i], field[j * cols + i + 1], field[(j + 1) * cols + i + 1], field[(j + 1) * cols + i]];
      const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < lv) !== (b < lv)) {
          const t = (lv - a) / (b - a);
          const [x0, y0] = P[e], [x1, y1] = P[(e + 1) % 4];
          pts.push([r1((x0 + (x1 - x0) * t) * STEP), r1((y0 + (y1 - y0) * t) * STEP)]);
        }
      }
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
    }
  }
  // chain segments into polylines
  const key = (p) => `${p[0]},${p[1]}`;
  const ends = new Map();
  segs.forEach((s, k) => s.forEach((p) => { const kk = key(p); (ends.get(kk) ?? ends.set(kk, []).get(kk)).push(k); }));
  const used = new Uint8Array(segs.length);
  const out = [];
  for (let k = 0; k < segs.length; k++) {
    if (used[k]) continue;
    used[k] = 1;
    const line = [...segs[k]];
    for (const dir of [1, -1]) {
      for (;;) {
        const tip = dir === 1 ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) ?? []).find((n) => !used[n]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir === 1) line.push(other);
        else line.unshift(other);
      }
    }
    if (line.length < 4) continue;
    // simplify: the curve stays smooth at this scale
    const thin = rdp(line, 1.2);
    out.push('M' + thin.map((p) => `${p[0]} ${p[1]}`).join('L'));
  }
  (lv % 5 === 0 ? paths.major : paths.minor).push(...out);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<path stroke="#D2D2D7" stroke-width="1" d="${paths.minor.join('')}"/>
<path stroke="#D2D2D7" stroke-width="1" d="${paths.major.join('')}"/>
</svg>
`;
writeFileSync('public/images/topography.svg', svg);
console.log(`topography.svg ${(svg.length / 1024).toFixed(0)} KB`);
