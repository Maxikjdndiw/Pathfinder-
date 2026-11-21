/**
 * Liquid glass for the header and the field tags in "Für wen".
 *
 * Each element gets its own SVG filter, applied with `backdrop-filter: url(#…)`:
 *  - a displacement map generated from the element's rounded shape: zero in the calm
 *    middle, strong at the curved rim, so the page behind bends and magnifies like a lens;
 *  - three displacements with slightly different strength, one per colour channel,
 *    which gives the red/blue fringe only where the bending is strong (the rim).
 *
 * `backdrop-filter: url()` only renders in Chromium browsers. Everywhere else nothing
 * changes and the frosted CSS glass stays.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function supportsSvgBackdrop(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData;
  if (uaData?.brands?.some((b) => b.brand === 'Chromium')) return true;
  const ua = navigator.userAgent;
  // Chrome on iOS (CriOS) etc. use WebKit underneath, so they are excluded
  return /Chrome\/\d+/.test(ua) && !/CriOS|EdgiOS|FxiOS|OPiOS/.test(ua);
}

function sdRoundRect(px: number, py: number, bx: number, by: number, r: number): number {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** R/G encode the x/y displacement (128 = none). */
function displacementMap(w: number, h: number, radius: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const bx = w / 2;
  const by = h / 2;
  const r = Math.min(radius, bx, by);
  // bending only in an outer band; the middle stays calm so text over it is readable
  const bevel = Math.max(6, Math.min(r * 0.9, Math.min(bx, by) * 0.7));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - bx;
      const py = y + 0.5 - by;
      const d = sdRoundRect(px, py, bx, by, r);
      let dx = 0;
      let dy = 0;
      if (d < 0) {
        const k = 1 - Math.min(1, -d / bevel);
        const nx = sdRoundRect(px + 1, py, bx, by, r) - sdRoundRect(px - 1, py, bx, by, r);
        const ny = sdRoundRect(px, py + 1, bx, by, r) - sdRoundRect(px, py - 1, bx, by, r);
        const len = Math.hypot(nx, ny) || 1;
        const bend = k * k;
        // sample inward: the backdrop only exists inside the element, and inward sampling
        // magnifies the rim like a lens. A little extra magnification over the whole area.
        dx = -(nx / len) * bend - (px / bx) * 0.08;
        dy = -(ny / len) * bend - (py / by) * 0.08;
      }
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(128 + Math.max(-1, Math.min(1, dx)) * 127);
      img.data[i + 1] = Math.round(128 + Math.max(-1, Math.min(1, dy)) * 127);
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const channel = {
  r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

export interface LiquidGlassOptions {
  /** filter id prefix, unique per call */
  prefix?: string;
  /** blur of the page behind the glass (px); higher = frostier */
  blur?: number;
  /** red/blue fringe at the rim; off = one clean refraction */
  chromatic?: boolean;
  /** how strongly the rim bends the page behind (1 = default) */
  strength?: number;
}

export function initSvgLiquidGlass(elements: HTMLElement[], options: LiquidGlassOptions = {}): () => void {
  const { prefix = 'liquid-glass', blur = 0.8, chromatic = true, strength = 1 } = options;
  if (!elements.length || !supportsSvgBackdrop()) return () => {};
  document.documentElement.classList.add('has-svg-glass');

  const svg = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const defs = el('defs', {});
  svg.appendChild(defs);
  document.body.appendChild(svg);

  const build = (target: HTMLElement, index: number) => {
    const w = Math.max(2, Math.round(target.offsetWidth));
    const h = Math.max(2, Math.round(target.offsetHeight));
    const key = `${w}x${h}`;
    if (target.dataset.lgSize === key) return;
    target.dataset.lgSize = key;

    const id = `${prefix}-${index}`;
    defs.querySelector(`#${id}`)?.remove();
    const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
    // strength scales with the element: small tags bend less than the big nav pill
    const scale = Math.round(Math.min(28, Math.max(14, Math.min(w, h) * 0.45)) * strength);

    const filter = el('filter', {
      id,
      x: 0,
      y: 0,
      width: w,
      height: h,
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    });
    filter.appendChild(
      el('feImage', { href: displacementMap(w, h, radius), x: 0, y: 0, width: w, height: h, result: 'map', preserveAspectRatio: 'none' }),
    );
    filter.appendChild(el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, edgeMode: 'duplicate', result: 'soft' }));
    if (chromatic) {
      const parts: [keyof typeof channel, number][] = [
        ['r', scale * 1.07],
        ['g', scale],
        ['b', scale * 0.93],
      ];
      for (const [c, sc] of parts) {
        filter.appendChild(
          el('feDisplacementMap', { in: 'soft', in2: 'map', scale: sc.toFixed(1), xChannelSelector: 'R', yChannelSelector: 'G', result: `d${c}` }),
        );
        filter.appendChild(el('feColorMatrix', { in: `d${c}`, type: 'matrix', values: channel[c], result: c }));
      }
      filter.appendChild(el('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }));
      filter.appendChild(el('feBlend', { in: 'rg', in2: 'b', mode: 'screen' }));
    } else {
      filter.appendChild(el('feDisplacementMap', { in: 'soft', in2: 'map', scale, xChannelSelector: 'R', yChannelSelector: 'G' }));
    }
    defs.appendChild(filter);

    target.style.setProperty('--lg-filter', `url(#${id})`);
    target.classList.add('lg-svg');
  };

  elements.forEach(build);
  const ro = new ResizeObserver(() => elements.forEach(build));
  elements.forEach((t) => ro.observe(t));

  // specular highlight follows the pointer
  let queued = false;
  let px = 0;
  const onMove = (e: PointerEvent) => {
    px = e.clientX;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const t of elements) {
        const r = t.getBoundingClientRect();
        t.style.setProperty('--lx', `${Math.max(-20, Math.min(r.width + 20, px - r.left))}px`);
      }
    });
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  return () => {
    ro.disconnect();
    window.removeEventListener('pointermove', onMove);
    document.documentElement.classList.remove('has-svg-glass');
    for (const t of elements) {
      t.classList.remove('lg-svg');
      t.style.removeProperty('--lg-filter');
      delete t.dataset.lgSize;
    }
    svg.remove();
  };
}
