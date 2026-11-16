/**
 * Hero card stack: a 3D stack of cards that sends the front card to the back on a timer.
 * Vanilla TypeScript take on the React Bits "Card Swap" component (https://reactbits.dev,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0), built with GSAP.
 * Used as part of this website only; not for resale or redistribution as a component.
 *
 * The cards are plain HTML in index.html (so they render before any script); this module
 * only positions and animates them.
 *
 * - every 4 s the front card drops and moves to the back (about 1.2 s, ease power3)
 * - pauses on hover, when the stack is off screen and when the tab is hidden
 * - prefers-reduced-motion: static stack, no timer
 */
import { gsap } from 'gsap';
import './card-swap.css';

export interface CardSwapOptions {
  /** ms between swaps */
  delay?: number;
  /** horizontal and vertical step between cards, as a share of the card size */
  stepX?: number;
  stepY?: number;
  skew?: number;
}

export interface CardSwapHandle {
  destroy(): void;
}

export function createCardSwap(root: HTMLElement, options: CardSwapOptions = {}): CardSwapHandle {
  const o = { delay: 4000, stepX: 40 / 340, stepY: 48 / 440, skew: 4, ...options };
  const cards = [...root.querySelectorAll<HTMLElement>('.hc')];
  const n = cards.length;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let order = cards.map((_, i) => i);
  let timer = 0;
  let busy = false;
  let hovered = false;
  let visible = true;
  let tl: gsap.core.Timeline | null = null;

  // slot geometry from the current card size (CSS decides the size per breakpoint;
  // the steps mirror --hc-dx / --hc-dy in card-swap.css)
  const small = window.matchMedia('(max-width: 899px)');
  const slot = (i: number) => {
    const w = cards[0].offsetWidth;
    const h = cards[0].offsetHeight;
    const sx = small.matches ? 20 / 260 : o.stepX;
    const sy = small.matches ? 34 / 340 : o.stepY;
    return { x: i * w * sx, y: -i * h * sy, z: -i * w * 0.18, zIndex: n - i, shade: (i / Math.max(1, n - 1)) * 0.42 };
  };

  const place = () => {
    order.forEach((cardIndex, i) => {
      const s = slot(i);
      const el = cards[cardIndex];
      gsap.set(el, { x: s.x, y: s.y, z: s.z, skewY: o.skew, zIndex: s.zIndex, transformOrigin: 'center center', force3D: true });
      gsap.set(el.querySelector('.hc__shade'), { opacity: s.shade });
    });
  };

  const swap = () => {
    if (busy || n < 2) return;
    busy = true;
    const [frontIndex, ...rest] = order;
    const front = cards[frontIndex];
    const h = front.offsetHeight;
    tl = gsap.timeline({
      onComplete: () => {
        order = [...rest, frontIndex];
        busy = false;
        schedule();
      },
    });
    // 1. the front card drops
    tl.to(front, { y: `+=${h * 1.15}`, duration: 0.5, ease: 'power3.in' });
    // 2. the others move one slot forward
    rest.forEach((cardIndex, i) => {
      const s = slot(i);
      const el = cards[cardIndex];
      tl!.set(el, { zIndex: s.zIndex }, 0.4);
      tl!.to(el, { x: s.x, y: s.y, z: s.z, duration: 0.6, ease: 'power3.out' }, 0.35 + i * 0.06);
      tl!.to(el.querySelector('.hc__shade'), { opacity: s.shade, duration: 0.6, ease: 'power3.out' }, 0.35 + i * 0.06);
    });
    // 3. the dropped card comes back in at the back
    const back = slot(n - 1);
    tl.set(front, { zIndex: back.zIndex }, 0.5);
    tl.to(front, { x: back.x, y: back.y, z: back.z, duration: 0.6, ease: 'power3.out' }, 0.55);
    tl.to(front.querySelector('.hc__shade'), { opacity: back.shade, duration: 0.6, ease: 'power3.out' }, 0.55);
  };

  function schedule() {
    clearTimeout(timer);
    timer = 0;
    if (reduce || hovered || !visible || document.hidden || busy) return;
    timer = window.setTimeout(swap, o.delay);
  }

  const onEnter = () => {
    hovered = true;
    schedule();
  };
  const onLeave = () => {
    hovered = false;
    schedule();
  };
  const onVisibility = () => schedule();
  root.addEventListener('pointerenter', onEnter);
  root.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVisibility);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  });
  io.observe(root);
  const ro = new ResizeObserver(() => {
    if (!busy) place();
  });
  ro.observe(root);

  place();
  root.classList.add('is-ready');
  schedule();

  return {
    destroy() {
      clearTimeout(timer);
      tl?.kill();
      io.disconnect();
      ro.disconnect();
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
