/**
 * World map for the Studium mode: one pin per university, pan and zoom, clustering at low zoom.
 * Everything is bundled (world-atlas countries-110m, d3-geo, d3-zoom), no tile server, no CDN.
 *
 * - land #F5F5F7, borders #D2D2D7, ocean transparent; Natural Earth projection
 * - pins are HTML buttons over the SVG (aria-label, focus, Enter): accent for public,
 *   ink for private universities
 * - pins that do not match the filters are dimmed, not removed
 * - highlight(ids) emphasises some pins, dims the rest and flies to them (500 ms ease;
 *   no animation with prefers-reduced-motion)
 */
import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import { easeCubicInOut } from 'd3-ease';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { FitStatus, Offer } from './offers';

export interface MapHandle {
  /** ids that match the current filters (others are dimmed) */
  setMatching(ids: Set<string>, fit?: Map<string, FitStatus>): void;
  /** emphasise these pins and fly to them; null clears it */
  highlight(ids: string[] | null): void;
  destroy(): void;
}

interface Pin {
  o: Offer;
  x: number;
  y: number;
}

const CLUSTER_PX = 42;
const MIN_K = 1;
const MAX_K = 40;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mountMap(host: HTMLElement, offers: Offer[], opts: { onSelect(o: Offer): void }): MapHandle {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const located = offers.filter((o) => typeof o.lat === 'number' && typeof o.lng === 'number');
  const elsewhere = offers.filter((o) => !(typeof o.lat === 'number' && typeof o.lng === 'number'));

  host.classList.add('map');
  host.innerHTML = `
    <div class="map__stage" tabindex="0" role="application" aria-label="Weltkarte der Hochschulen. Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen.">
      <svg class="map__svg" aria-hidden="true"><g class="map__world"><path class="map__land"></path><path class="map__borders"></path></g></svg>
      <div class="map__pins"></div>
      <div class="map__tip" role="tooltip" hidden></div>
    </div>
    <div class="map__zoom">
      <button type="button" class="map__btn" data-z="in" aria-label="Hineinzoomen">+</button>
      <button type="button" class="map__btn" data-z="out" aria-label="Herauszoomen">−</button>
      <button type="button" class="map__btn map__btn--reset" data-z="reset" aria-label="Ansicht zurücksetzen">Start</button>
    </div>
    ${
      elsewhere.length
        ? `<p class="map__elsewhere">Mehrere Standorte: ${elsewhere.map((o) => `<button type="button" class="map__link" data-id="${esc(o.id)}">${esc(o.name)}</button>`).join(', ')}</p>`
        : ''
    }`;
  const stage = host.querySelector<HTMLElement>('.map__stage')!;
  const svg = select(host.querySelector<SVGSVGElement>('.map__svg')!);
  const worldG = svg.select<SVGGElement>('.map__world');
  const pinsBox = host.querySelector<HTMLElement>('.map__pins')!;
  const tip = host.querySelector<HTMLElement>('.map__tip')!;

  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const land = feature(topo, topo.objects.countries);
  const borders = mesh(topo, topo.objects.countries, (a, b) => a !== b);

  let w = 0;
  let h = 0;
  let projection: GeoProjection = geoNaturalEarth1();
  let pins: Pin[] = [];
  let t: ZoomTransform = zoomIdentity;
  let matching: Set<string> | null = null;
  let fit = new Map<string, FitStatus>();
  let highlighted: Set<string> | null = null;
  /** same-place points that are folded out (key: their ids) */
  const expanded = new Set<string>();
  const byId = new Map(offers.map((o) => [o.id, o]));

  const zoomer: ZoomBehavior<HTMLElement, unknown> = d3zoom<HTMLElement, unknown>()
    .scaleExtent([MIN_K, MAX_K])
    .on('zoom', (e: { transform: ZoomTransform }) => {
      t = e.transform;
      worldG.attr('transform', t.toString());
      drawPins();
    });
  const stageSel = select(stage) as unknown as Selection<HTMLElement, unknown, null, undefined>;
  stageSel.call(zoomer).on('dblclick.zoom', null);

  /** the transform that fits a lon/lat box (west, south, east, north) into the stage */
  function fitBox([w0, s0, e0, n0]: [number, number, number, number], pad = 40, maxK = MAX_K): ZoomTransform {
    const pts = [projection([w0, n0])!, projection([e0, s0])!, projection([w0, s0])!, projection([e0, n0])!];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bx = Math.max(...xs) - Math.min(...xs) || 1;
    const by = Math.max(...ys) - Math.min(...ys) || 1;
    const k = Math.max(MIN_K, Math.min(maxK, Math.min((w - pad * 2) / bx, (h - pad * 2) / by)));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    return zoomIdentity.translate(w / 2 - k * cx, h / 2 - k * cy).scale(k);
  }
  // start: Europe and the Atlantic, so Germany, the UK and the US east coast are visible
  const startView = () => fitBox([-80, 22, 26, 62], 16);

  function layout() {
    const r = stage.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    projection = geoNaturalEarth1().fitExtent([[4, 4], [w - 4, h - 4]], land);
    const path = geoPath(projection);
    worldG.select('.map__land').attr('d', path(land) ?? '');
    worldG.select('.map__borders').attr('d', path(borders) ?? '');
    pins = located.map((o) => {
      const [x, y] = projection([o.lng!, o.lat!])!;
      return { o, x, y };
    });
    zoomer.extent([[0, 0], [w, h]]).translateExtent([[-w * 0.2, -h * 0.2], [w * 1.2, h * 1.2]]);
  }

  /** pins in screen space; pins closer than CLUSTER_PX to a bubble's centre join it, so bubbles never overlap */
  function drawPins() {
    const groups: { x: number; y: number; pins: Pin[] }[] = [];
    for (const p of pins) {
      const sx = t.applyX(p.x);
      const sy = t.applyY(p.y);
      const near = groups.find((g) => Math.hypot(g.x - sx, g.y - sy) < CLUSTER_PX);
      if (near) {
        near.pins.push(p);
        near.x += (sx - near.x) / near.pins.length;
        near.y += (sy - near.y) / near.pins.length;
      } else groups.push({ x: sx, y: sy, pins: [p] });
    }
    // a second pass merges bubbles that moved close to each other
    for (let i = 0; i < groups.length; i++) {
      for (let j = groups.length - 1; j > i; j--) {
        const a = groups[i];
        const c = groups[j];
        if (Math.hypot(a.x - c.x, a.y - c.y) < CLUSTER_PX) {
          const n = a.pins.length + c.pins.length;
          a.x = (a.x * a.pins.length + c.x * c.pins.length) / n;
          a.y = (a.y * a.pins.length + c.y * c.pins.length) / n;
          a.pins.push(...c.pins);
          groups.splice(j, 1);
        }
      }
    }
    const cells = new Map(groups.map((g, i) => [String(i), g.pins]));
    const html: string[] = [];
    for (const group of cells.values()) {
      const sx = group.reduce((a, p) => a + t.applyX(p.x), 0) / group.length;
      const sy = group.reduce((a, p) => a + t.applyY(p.y), 0) / group.length;
      // (the centre of the members, same as the bubble position)
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      // dimming follows the filters and the fit check ("Unter dem Richtwert" dimmed most);
      // highlighted pins keep their ring on top. A group takes the lightest level of its members.
      const LEVELS = ['', 'is-near', 'is-dim', 'is-below'];
      const level = (p: Pin): number => {
        const st = fit.get(p.o.id);
        if (st === 'unter') return 3;
        if (matching && !matching.has(p.o.id)) return 2;
        return st === 'nahe' ? 1 : 0;
      };
      const groupDim = (g: Pin[]) => {
        const c = LEVELS[Math.min(...g.map(level))];
        return c ? ` ${c}` : '';
      };
      const pinHtml = (o: Offer, x: number, y: number, d: string) => {
        const cls = ['map__pin', o.rechtsform === 'privat' ? 'is-privat' : 'is-oeffentlich', d, highlighted?.has(o.id) ? 'is-hi' : ''].join(' ');
        return `<button type="button" class="${cls}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)" data-id="${esc(o.id)}" aria-label="${esc(`${o.name}, ${o.ort ?? ''}`)}"></button>`;
      };
      // universities in the same place (or already at the deepest zoom) never split by zooming:
      // show them as single pins in a small ring around the spot
      const samePlace =
        group.length > 1 &&
        (t.k >= MAX_K * 0.95 ||
          (Math.max(...group.map((p) => p.o.lat!)) - Math.min(...group.map((p) => p.o.lat!)) < 0.3 &&
            Math.max(...group.map((p) => p.o.lng!)) - Math.min(...group.map((p) => p.o.lng!)) < 0.3));
      if (samePlace && group.length <= 8) {
        const key = group.map((p) => p.o.id).sort().join(',');
        if (expanded.has(key)) {
          // folded out: single pins in a small ring around the spot
          group.forEach((p, i) => {
            const a = (i / group.length) * Math.PI * 2 - Math.PI / 2;
            html.push(pinHtml(p.o, sx + Math.cos(a) * 16, sy + Math.sin(a) * 16, LEVELS[level(p)]));
          });
        } else {
          // one point with the count, folds out on tap
          const allDim = groupDim(group);
          const hi = group.some((p) => highlighted?.has(p.o.id));
          const kind = group.every((p) => p.o.rechtsform !== 'privat') ? 'is-oeffentlich' : group.every((p) => p.o.rechtsform === 'privat') ? 'is-privat' : 'is-gemischt';
          html.push(
            `<button type="button" class="map__spot ${kind}${allDim}${hi ? ' is-hi' : ''}" style="transform:translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)" data-spot="${esc(key)}" aria-expanded="false" aria-label="${group.length} Hochschulen an diesem Ort: ${esc(group.map((p) => p.o.name).join(', '))}. Aufklappen">${group.length}</button>`,
          );
        }
        continue;
      }
      if (group.length === 1) {
        const { o } = group[0];
        html.push(pinHtml(o, sx, sy, LEVELS[level(group[0])]));
      } else {
        const allDim = groupDim(group);
        const hi = group.some((p) => highlighted?.has(p.o.id));
        html.push(
          `<button type="button" class="map__cluster${allDim}${hi ? ' is-hi' : ''}" style="transform:translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)" data-cluster="${sx.toFixed(1)},${sy.toFixed(1)}" aria-label="${group.length} Hochschulen, hineinzoomen">${group.length}</button>`,
        );
      }
    }
    pinsBox.innerHTML = html.join('');
  }

  function go(to: ZoomTransform, animate = true) {
    if (reduce || !animate) stageSel.call(zoomer.transform, to);
    else stageSel.transition().duration(500).ease(easeCubicInOut).call(zoomer.transform, to);
  }

  // tooltip on hover and focus
  const showTip = (btn: HTMLElement) => {
    const o = byId.get(btn.dataset.id ?? '');
    if (!o) return;
    tip.innerHTML = `<strong>${esc(o.name)}</strong><span>${esc(o.ort ?? '')}${o.kosten_label ? ` · ${esc(o.kosten_label)}` : ''}</span>`;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - s.left + r.width / 2, 90), s.width - 90);
    tip.style.transform = `translate(${x.toFixed(0)}px, ${(r.top - s.top).toFixed(0)}px)`;
  };
  const hideTip = () => (tip.hidden = true);
  pinsBox.addEventListener('pointerover', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.map__pin');
    if (b) showTip(b);
  });
  pinsBox.addEventListener('pointerout', hideTip);
  pinsBox.addEventListener('focusin', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.map__pin');
    if (b) showTip(b);
  });
  pinsBox.addEventListener('focusout', hideTip);

  // click or Enter: a pin opens its card, a bubble zooms in
  const onActivate = (e: Event) => {
    const spot = (e.target as HTMLElement).closest<HTMLElement>('[data-spot]');
    if (spot) {
      expanded.add(spot.dataset.spot!);
      drawPins();
      // keep the keyboard on the first folded-out pin
      pinsBox.querySelector<HTMLElement>(`[data-id="${CSS.escape(spot.dataset.spot!.split(',')[0])}"]`)?.focus();
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id], [data-cluster]');
    if (!el) {
      // a tap on the empty map folds everything back
      if (expanded.size && (e.target as HTMLElement).closest('.map__stage')) {
        expanded.clear();
        drawPins();
      }
      return;
    }
    if (el.dataset.cluster) {
      const [cx, cy] = el.dataset.cluster.split(',').map(Number);
      const k = Math.min(MAX_K, t.k * 2.5);
      const [px, py] = t.invert([cx, cy]);
      go(zoomIdentity.translate(w / 2 - k * px, h / 2 - k * py).scale(k));
      return;
    }
    const o = byId.get(el.dataset.id!);
    if (o) opts.onSelect(o);
  };
  host.addEventListener('click', onActivate);

  // zoom buttons and keys
  host.querySelectorAll<HTMLButtonElement>('[data-z]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.z === 'reset') return go(startView());
      stageSel.transition().duration(reduce ? 0 : 250).call(zoomer.scaleBy, b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
    }),
  );
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && expanded.size) {
      expanded.clear();
      drawPins();
    }
  });
  stage.addEventListener('keydown', (e) => {
    if (e.target !== stage) return;
    const step = 60;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      stageSel.call(zoomer.translateBy, moves[e.key][0] / t.k, moves[e.key][1] / t.k);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      stageSel.call(zoomer.scaleBy, 1.6);
    } else if (e.key === '-') {
      e.preventDefault();
      stageSel.call(zoomer.scaleBy, 1 / 1.6);
    }
  });

  layout();
  go(startView(), false);
  const ro = new ResizeObserver(() => {
    const before = { w, h };
    layout();
    if (Math.abs(before.w - w) > 2 || Math.abs(before.h - h) > 2) go(startView(), false);
    else drawPins();
  });
  ro.observe(stage);

  return {
    setMatching(ids, fitMap) {
      matching = ids;
      fit = fitMap ?? new Map();
      drawPins();
    },
    highlight(ids) {
      const known = ids?.filter((id) => byId.has(id)) ?? [];
      highlighted = known.length ? new Set(known) : null;
      const pts = pins.filter((p) => highlighted?.has(p.o.id));
      if (!pts.length) return drawPins();
      // fit the highlighted pins (with room around a single one)
      const lons = pts.map((p) => p.o.lng!);
      const lats = pts.map((p) => p.o.lat!);
      const padDeg = pts.length === 1 ? 6 : 2;
      // not deeper than a region view, so the surroundings stay recognisable
      go(fitBox([Math.min(...lons) - padDeg, Math.min(...lats) - padDeg, Math.max(...lons) + padDeg, Math.max(...lats) + padDeg], 36, 12));
      drawPins();
    },
    destroy() {
      ro.disconnect();
      stageSel.on('.zoom', null);
      host.innerHTML = '';
      host.classList.remove('map');
    },
  };
}
