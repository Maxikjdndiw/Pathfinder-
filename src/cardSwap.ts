/**
 * CardSwap: ported from the React Bits <CardSwap /> component (https://reactbits.dev)
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0 (React Bits).
 * Used as part of this website only; not for resale or redistribution as a component.
 * to plain TypeScript (no React, no icon package). The spring physics, drag/fling,
 * autoplay, parallax and hover spread are unchanged.
 *
 *   const swap = createCardSwap(root, cardElements, { width: 480, height: 300 });
 *   swap.next(); swap.prev(); swap.destroy();
 */
import './styles/cardSwap.css';

export interface CardSwapOptions {
  width?: number;
  height?: number;
  cardDistance?: number;
  verticalDistance?: number;
  depth?: number;
  skewAmount?: number;
  visibleCards?: number;
  delay?: number;
  autoplay?: boolean;
  pauseOnHover?: boolean;
  draggable?: boolean;
  speed?: number;
  bounce?: number;
  parallax?: number;
  hoverSpread?: number;
  dim?: number;
  cardRadius?: number;
  intro?: boolean;
  label?: string;
  /** free space around the stack inside the stage (px), for shadows and the hover spread */
  pad?: number;
  onChange?: (index: number) => void;
  onCardClick?: (index: number) => void;
}

export interface CardSwapHandle {
  next(): void;
  prev(): void;
  destroy(): void;
}

const PERSPECTIVE = 900;
const TAU = Math.PI * 2;
const STEP = 1 / 240;
const PAD = 32;
const AXES = ['x', 'y', 'z', 'r', 'p'] as const;
type Axis = (typeof AXES)[number];
type Vec = Record<Axis, number>;
const DOWN = { x: 0, y: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const stackBounds = (o: { width: number; height: number; cardDistance: number; verticalDistance: number; depth: number; skewAmount: number; visible: number; hoverSpread: number; pad?: number }) => {
  const PAD_ = o.pad ?? PAD;
  const slope = Math.tan((o.skewAmount * Math.PI) / 180);
  const spread = 1 + Math.max(0, o.hoverSpread);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < o.visible; i++) {
    const scale = PERSPECTIVE / (PERSPECTIVE + i * o.depth);
    for (const u of [-o.width / 2, o.width / 2]) {
      for (const v of [-o.height / 2, o.height / 2]) {
        const x = (i * o.cardDistance * spread + u) * scale;
        const y = (-i * o.verticalDistance * spread + v + u * slope) * scale;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    width: Math.ceil(maxX - minX + PAD_ * 2),
    height: Math.ceil(maxY - minY + PAD_ * 2),
    originX: PAD_ - minX,
    originY: PAD_ - minY,
  };
};

interface DeckCard extends Vec {
  el: HTMLElement;
  shade: HTMLElement;
  index: number;
  pos: number;
  from: number;
  hold: number;
  nudge: number;
  phase: 'rest' | 'exit' | 'enter' | 'drag';
  dir: { x: number; y: number };
  tilt: number;
  top: number;
  under: boolean;
  v: Vec;
}

export function createCardSwap(root: HTMLElement, cards: HTMLElement[], options: CardSwapOptions = {}): CardSwapHandle {
  const o = {
    width: 460,
    height: 340,
    cardDistance: 60,
    verticalDistance: 70,
    depth: 90,
    skewAmount: 6,
    visibleCards: 4,
    delay: 4000,
    autoplay: true,
    pauseOnHover: true,
    draggable: true,
    speed: 1,
    bounce: 0.35,
    parallax: 0.5,
    hoverSpread: 0.12,
    dim: 0.5,
    cardRadius: 18,
    intro: true,
    label: 'Kartenstapel',
    ...options,
  };
  const count = cards.length;
  const s = {
    width: Math.max(40, o.width),
    height: Math.max(40, o.height),
    dx: o.cardDistance,
    dy: o.verticalDistance,
    dz: Math.max(0, o.depth),
    skew: o.skewAmount,
    visible: clamp(Math.round(o.visibleCards), 1, Math.max(1, count)),
    speed: clamp(o.speed, 0.1, 4),
    bounce: clamp(o.bounce, 0, 1),
    parallax: clamp(o.parallax, 0, 1),
    hoverSpread: Math.max(0, o.hoverSpread),
    dim: clamp(o.dim, 0, 1),
    bounds: { width: 0, height: 0, originX: 0, originY: 0 },
  };
  s.bounds = stackBounds({ width: s.width, height: s.height, cardDistance: s.dx, verticalDistance: s.dy, depth: s.dz, skewAmount: s.skew, visible: s.visible, hoverSpread: s.hoverSpread, pad: o.pad });

  // ----- DOM -----
  root.classList.add('card-swap');
  root.tabIndex = 0;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'Karussell');
  root.setAttribute('aria-label', o.label);
  const vars: Record<string, string> = {
    '--swap-w': `${s.width}px`,
    '--swap-h': `${s.height}px`,
    '--swap-ox': `${s.bounds.originX}px`,
    '--swap-oy': `${s.bounds.originY}px`,
    '--swap-stage-w': `${s.bounds.width}px`,
    '--swap-stage-h': `${s.bounds.height}px`,
    '--swap-ratio': `${s.bounds.width} / ${s.bounds.height}`,
    '--swap-radius': `${Math.max(0, o.cardRadius)}px`,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const sizer = document.createElement('div');
  sizer.className = 'card-swap-sizer';
  sizer.setAttribute('aria-hidden', 'true');
  sizer.appendChild(document.createElement('span'));
  const stage = document.createElement('div');
  stage.className = 'card-swap-stage';
  root.append(sizer, stage);

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const now = performance.now();

  const deck: DeckCard[] = cards.map((card, index) => {
    const slotEl = document.createElement('div');
    slotEl.className = 'card-swap-slot';
    slotEl.dataset.swapIndex = String(index);
    card.classList.add('card-swap-card');
    const rim = document.createElement('span');
    rim.className = 'card-swap-card-rim';
    rim.setAttribute('aria-hidden', 'true');
    card.appendChild(rim);
    const shade = document.createElement('span');
    shade.className = 'card-swap-shade';
    shade.setAttribute('aria-hidden', 'true');
    slotEl.append(card, shade);
    stage.appendChild(slotEl);
    return {
      el: slotEl,
      shade,
      index,
      pos: index,
      from: index,
      hold: 0,
      nudge: 0,
      phase: 'rest',
      dir: { x: 0, y: 1 },
      tilt: 0,
      top: 0,
      under: false,
      x: 0,
      y: 0,
      z: 0,
      r: 0,
      p: 0,
      v: { x: 0, y: 0, z: 0, r: 0, p: 0 },
    };
  });

  const state = {
    order: deck.map((c) => c.index),
    raf: 0,
    last: 0,
    timer: 0,
    queue: [] as number[],
    layers: 0,
    scale: 1,
    hovered: false,
    overCard: false,
    inView: true,
    drag: null as null | { id: number; index: number; startX: number; startY: number; active: boolean; samples: { x: number; y: number; t: number }[] },
    spread: 0,
    spreadV: 0,
    px: 0,
    py: 0,
    pvx: 0,
    pvy: 0,
    tx: 0,
    ty: 0,
    dragged: false,
  };

  const slot = (position: number): Vec => {
    const q = Math.min(position, s.visible);
    const spread = 1 + state.spread;
    return { x: q * s.dx * spread, y: -q * s.dy * spread, z: -q * s.dz, r: 0, p: q };
  };
  const clearance = (dir: { x: number; y: number }) => Math.abs(dir.x) * s.width + Math.abs(dir.y) * s.height + 12;

  const targetOf = (card: DeckCard, time: number): Vec => {
    if (card.phase === 'exit') {
      const base = slot(0);
      const reach = clearance(card.dir) * 1.3;
      return { x: base.x + card.dir.x * reach, y: base.y + card.dir.y * reach, z: base.z, r: card.tilt, p: 0 };
    }
    if (card.phase === 'enter') {
      const base = slot(0);
      return { x: base.x, y: base.y + clearance(DOWN) * 1.3, z: base.z, r: 0, p: card.p };
    }
    const position = (time < card.hold ? card.from : card.pos) + card.nudge;
    return slot(Math.max(0, position));
  };

  const layerOf = (card: DeckCard) => {
    if (card.top) return 1000 + card.top;
    if (card.under) return 1;
    return 10 + (count - card.pos) * 2;
  };

  const write = (card: DeckCard) => {
    const { el, shade } = card;
    el.style.transform = `translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, ${card.z.toFixed(2)}px) rotate(${card.r.toFixed(3)}deg) skewY(${s.skew}deg)`;
    el.style.zIndex = String(layerOf(card));
    const fade = clamp(s.visible - card.p, 0, 1);
    el.style.opacity = fade < 1 ? fade.toFixed(3) : '';
    el.style.visibility = fade <= 0.001 ? 'hidden' : '';
    const depthT = clamp(card.p / Math.max(1, s.visible - 1), 0, 1);
    shade.style.opacity = (s.dim * 0.62 * depthT).toFixed(3);
    el.style.cursor = card.phase === 'drag' ? 'grabbing' : card.pos > 0 ? 'pointer' : o.draggable ? 'grab' : '';
    if (card.pos === 0) el.setAttribute('data-front', '');
    else el.removeAttribute('data-front');
    // only the front card is read out / focusable
    el.setAttribute('aria-hidden', card.pos === 0 ? 'false' : 'true');
    // cards behind the front one are not focusable either
    el.inert = card.pos !== 0;
  };

  const writeStage = () => {
    stage.style.perspectiveOrigin = `${(s.bounds.originX + state.px).toFixed(2)}px ${(s.bounds.originY + state.py).toFixed(2)}px`;
  };

  const integrate = (card: DeckCard, target: Vec, omega: number, zeta: number, dt: number) => {
    const k = omega * omega;
    const d = 2 * zeta * omega;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const axis of AXES) {
        const velocity = card.v[axis] + (k * (target[axis] - card[axis]) - d * card.v[axis]) * h;
        card.v[axis] = velocity;
        card[axis] += velocity * h;
      }
    }
  };

  const scalar = (value: number, velocity: number, target: number, omega: number, zeta: number, dt: number) => {
    const k = omega * omega;
    const d = 2 * zeta * omega;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    let x = value;
    let v = velocity;
    for (let i = 0; i < steps; i++) {
      v += (k * (target - x) - d * v) * h;
      x += v * h;
    }
    return [x, v];
  };

  const frame = (time: number) => {
    state.raf = 0;
    const dt = state.last ? Math.min(0.05, (time - state.last) / 1000) : 1 / 60;
    state.last = time;
    const restOmega = TAU * 1.7 * s.speed;
    const restZeta = reduce ? 1 : 1 - 0.72 * s.bounce;
    const exitOmega = TAU * 1.9 * s.speed;
    let busy = false;

    const spreadTarget = state.hovered && !reduce ? s.hoverSpread : 0;
    [state.spread, state.spreadV] = scalar(state.spread, state.spreadV, spreadTarget, TAU * 1.4, 0.9, dt);
    [state.px, state.pvx] = scalar(state.px, state.pvx, reduce ? 0 : state.tx, TAU * 1.1, 1, dt);
    [state.py, state.pvy] = scalar(state.py, state.pvy, reduce ? 0 : state.ty, TAU * 1.1, 1, dt);
    if (
      Math.abs(state.spread - spreadTarget) > 0.0005 ||
      Math.abs(state.spreadV) > 0.0005 ||
      Math.abs(state.px - state.tx) > 0.05 ||
      Math.abs(state.py - state.ty) > 0.05 ||
      Math.abs(state.pvx) + Math.abs(state.pvy) > 0.05
    ) {
      busy = true;
    }
    writeStage();

    for (const card of deck) {
      if (card.phase === 'drag') {
        busy = true;
        write(card);
        continue;
      }
      const target = targetOf(card, time);
      const moving = card.phase === 'exit' || card.phase === 'enter';
      integrate(card, target, moving ? exitOmega : restOmega, moving ? 1 : restZeta, dt);
      if (card.phase === 'exit') {
        const base = slot(0);
        const travelled = (card.x - base.x) * card.dir.x + (card.y - base.y) * card.dir.y;
        if (travelled >= clearance(card.dir)) {
          card.phase = 'rest';
          card.top = 0;
          card.hold = 0;
        }
      } else if (card.phase === 'enter') {
        const base = slot(0);
        if (card.y - base.y >= clearance(DOWN)) {
          card.phase = 'rest';
          card.under = false;
          card.hold = 0;
        }
      }
      if (card.hold > time || card.phase !== 'rest') busy = true;
      for (const axis of AXES) {
        const limit = axis === 'p' ? 0.001 : 0.02;
        if (Math.abs(target[axis] - card[axis]) > limit || Math.abs(card.v[axis]) > limit) busy = true;
      }
      write(card);
    }

    if (busy) {
      state.raf = requestAnimationFrame(frame);
    } else {
      state.last = 0;
      for (const card of deck) if (card.top && card.phase === 'rest') card.top = 0;
    }
  };

  const wake = () => {
    if (!state.raf) state.raf = requestAnimationFrame(frame);
  };

  const paused = () =>
    !o.autoplay || count < 2 || (o.pauseOnHover && state.overCard) || !!state.drag || !state.inView || document.visibilityState === 'hidden';

  const schedule = () => {
    clearTimeout(state.timer);
    state.timer = 0;
    if (paused()) return;
    state.timer = window.setTimeout(() => {
      state.timer = 0;
      shift(1);
    }, Math.max(400, o.delay));
  };

  const settleOrder = (time: number, stagger: number) => {
    state.order.forEach((index, position) => {
      const card = deck[index];
      if (card.pos === position) return;
      card.from = card.pos;
      card.pos = position;
      card.hold = time + Math.max(0, position) * stagger;
    });
  };

  const shift = (direction: number, opts: { dir?: { x: number; y: number }; tilt?: number; velocity?: { x: number; y: number } } = {}) => {
    if (count < 2) return;
    const time = performance.now();
    const stagger = 0.05 / s.speed;
    if (direction > 0) {
      const front = deck[state.order[0]];
      state.order = [...state.order.slice(1), front.index];
      settleOrder(time, stagger * 1000);
      front.phase = 'exit';
      front.dir = opts.dir ?? DOWN;
      front.tilt = opts.tilt ?? 0;
      front.top = ++state.layers;
      front.under = false;
      front.nudge = 0;
      front.hold = 0;
      if (opts.velocity) {
        front.v.x = opts.velocity.x;
        front.v.y = opts.velocity.y;
      }
    } else {
      const back = deck[state.order[count - 1]];
      state.order = [back.index, ...state.order.slice(0, count - 1)];
      settleOrder(time, stagger * 1000);
      back.phase = 'enter';
      back.top = 0;
      back.under = true;
      back.nudge = 0;
      back.hold = 0;
    }
    deck.forEach((card) => {
      if (card.phase === 'rest') card.nudge = 0;
    });
    o.onChange?.(state.order[0]);
    wake();
    schedule();
  };

  const goTo = (position: number) => {
    state.queue.forEach(clearTimeout);
    state.queue = [];
    const gap = 110 / s.speed;
    for (let i = 0; i < position; i++) state.queue.push(window.setTimeout(() => shift(1), i * gap));
  };

  const fit = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    const scale = Math.min(1, w / s.bounds.width, h > 0 ? h / s.bounds.height : 1);
    state.scale = scale > 0 ? scale : 1;
    stage.style.transform = `translate(-50%, -50%) scale(${state.scale.toFixed(4)})`;
  };

  const local = (event: PointerEvent) => {
    const box = root.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top, w: box.width, h: box.height };
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      const point = local(event);
      const nx = clamp((point.x / Math.max(1, point.w)) * 2 - 1, -1, 1);
      const ny = clamp((point.y / Math.max(1, point.h)) * 2 - 1, -1, 1);
      state.tx = nx * s.parallax * 0.35 * s.bounds.width;
      state.ty = ny * s.parallax * 0.35 * s.bounds.height;
      state.hovered = true;
      const overCard = Boolean((event.target as Element).closest?.('[data-swap-index]'));
      if (overCard !== state.overCard) {
        state.overCard = overCard;
        schedule();
      }
      wake();
    }
    const drag = state.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = (event.clientX - drag.startX) / state.scale;
    const dy = (event.clientY - drag.startY) / state.scale;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.active = true;
      state.dragged = true;
      const card = deck[drag.index];
      card.phase = 'drag';
      card.v = { x: 0, y: 0, z: 0, r: 0, p: 0 };
      root.setPointerCapture?.(event.pointerId);
      root.style.cursor = 'grabbing';
    }
    const card = deck[drag.index];
    const base = slot(0);
    card.x = base.x + dx;
    card.y = base.y + dy;
    card.z = base.z;
    card.r = clamp(dx * 0.035, -9, 9);
    card.p = 0;
    const time = performance.now();
    drag.samples.push({ x: card.x, y: card.y, t: time });
    while (drag.samples.length > 2 && time - drag.samples[0].t > 90) drag.samples.shift();
    const progress = clamp(Math.hypot(dx, dy) / (Math.min(s.width, s.height) * 0.3), 0, 1);
    const next = deck[state.order[1]];
    if (next && next.phase === 'rest') next.nudge = -0.22 * progress;
    wake();
  };

  const onLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (state.drag?.active) return;
    state.hovered = false;
    state.overCard = false;
    state.tx = 0;
    state.ty = 0;
    schedule();
    wake();
  };

  const onDown = (event: PointerEvent) => {
    state.dragged = false;
    if (!o.draggable || event.button > 0 || count < 2) return;
    const target = (event.target as Element).closest?.('[data-swap-index]');
    if (!target || !root.contains(target)) return;
    const index = Number(target.getAttribute('data-swap-index'));
    if (index !== state.order[0] || deck[index].phase !== 'rest') return;
    state.drag = { id: event.pointerId, index, startX: event.clientX, startY: event.clientY, active: false, samples: [] };
    schedule();
  };

  const onUp = (event: PointerEvent) => {
    const drag = state.drag;
    if (!drag || drag.id !== event.pointerId) return;
    state.drag = null;
    root.style.cursor = '';
    if (!drag.active) {
      schedule();
      return;
    }
    root.releasePointerCapture?.(event.pointerId);
    const card = deck[drag.index];
    const base = slot(0);
    const first = drag.samples[0];
    const lastSample = drag.samples[drag.samples.length - 1];
    const span = first && lastSample ? Math.max(0.016, (lastSample.t - first.t) / 1000) : 1;
    const velocity =
      first && lastSample && lastSample !== first ? { x: (lastSample.x - first.x) / span, y: (lastSample.y - first.y) / span } : { x: 0, y: 0 };
    const offset = { x: card.x - base.x, y: card.y - base.y };
    const distance = Math.hypot(offset.x, offset.y);
    const fling = Math.hypot(velocity.x, velocity.y);
    const next = deck[state.order[1]];
    if (next) next.nudge = 0;
    if (event.type !== 'pointercancel' && (distance > Math.min(s.width, s.height) * 0.3 || fling > 700)) {
      const aim = { x: offset.x + velocity.x * 0.12, y: offset.y + velocity.y * 0.12 };
      const length = Math.hypot(aim.x, aim.y) || 1;
      card.phase = 'rest';
      shift(1, { dir: { x: aim.x / length, y: aim.y / length }, tilt: card.r, velocity });
    } else {
      card.phase = 'rest';
      card.v.x = velocity.x;
      card.v.y = velocity.y;
      wake();
      schedule();
    }
  };

  const onClick = (event: MouseEvent) => {
    if (state.dragged) {
      state.dragged = false;
      return;
    }
    const target = (event.target as Element).closest?.('[data-swap-index]');
    if (!target || !root.contains(target)) return;
    const index = Number(target.getAttribute('data-swap-index'));
    o.onCardClick?.(index);
    const position = state.order.indexOf(index);
    // a tap on the front card shows the next one (phones have no arrows), a tap on a card
    // behind brings that card to the front
    if (position > 0) goTo(position);
    else if (position === 0 && state.order.length > 1) shift(1);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      shift(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      shift(-1);
    }
  };

  const onVisibility = () => schedule();

  if (o.intro && !reduce) {
    deck.forEach((card) => {
      card.from = 0;
      card.hold = now + (card.pos * 70) / s.speed;
    });
    stage.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' });
  } else {
    deck.forEach((card) => Object.assign(card, slot(card.pos)));
  }
  fit();
  writeStage();
  deck.forEach(write);
  wake();

  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(root);
  const intersectionObserver = new IntersectionObserver((entries) => {
    state.inView = entries[entries.length - 1]?.isIntersecting ?? true;
    schedule();
  });
  intersectionObserver.observe(root);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  schedule();

  return {
    next: () => shift(1),
    prev: () => shift(-1),
    destroy() {
      cancelAnimationFrame(state.raf);
      clearTimeout(state.timer);
      state.queue.forEach(clearTimeout);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
