/**
 * Bento grid effects: a soft spotlight that follows the cursor across the grid, edge light
 * on the cards near the cursor, a slight tilt on hover and a ripple on click.
 * CSS does the drawing (see styles/network.css), GSAP the motion.
 *
 * Inspired by the React Bits "Magic Bento" component (https://reactbits.dev),
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0.
 * Used as part of this website only; not for resale or redistribution as a component.
 *
 * Mouse / trackpad only; touch and prefers-reduced-motion get the plain cards.
 */
import { gsap } from 'gsap';

const PROXIMITY = 140; // px around a card where its edge starts to light up
const FADE = 220;

export function initBento(grid: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...grid.querySelectorAll<HTMLElement>('.bento__card')];
  const spot = document.createElement('div');
  spot.className = 'bento__spotlight';
  spot.setAttribute('aria-hidden', 'true');
  grid.appendChild(spot);

  const setX = gsap.quickTo(spot, 'x', { duration: 0.35, ease: 'power3.out' });
  const setY = gsap.quickTo(spot, 'y', { duration: 0.35, ease: 'power3.out' });

  grid.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const g = grid.getBoundingClientRect();
    setX(e.clientX - g.left);
    setY(e.clientY - g.top);
    gsap.to(spot, { opacity: 1, duration: 0.25, overwrite: 'auto' });
    for (const card of cards) {
      const r = card.getBoundingClientRect();
      // distance from the pointer to the card's edge (0 inside)
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const d = Math.hypot(dx, dy);
      const glow = d <= PROXIMITY ? 1 : d >= FADE ? 0 : 1 - (d - PROXIMITY) / (FADE - PROXIMITY);
      card.style.setProperty('--glow-x', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--glow-y', `${((e.clientY - r.top) / r.height) * 100}%`);
      card.style.setProperty('--glow', glow.toFixed(3));
    }
  });
  grid.addEventListener('pointerleave', () => {
    gsap.to(spot, { opacity: 0, duration: 0.4 });
    for (const card of cards) card.style.setProperty('--glow', '0');
  });

  for (const card of cards) {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, { rotateY: px * 6, rotateX: -py * 6, x: px * 6, y: py * 6, duration: 0.4, ease: 'power2.out', transformPerspective: 900 });
    });
    card.addEventListener('pointerleave', () => {
      gsap.to(card, { rotateX: 0, rotateY: 0, x: 0, y: 0, duration: 0.6, ease: 'power3.out' });
    });
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      const r = card.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'bento__ripple';
      ripple.setAttribute('aria-hidden', 'true');
      const size = Math.hypot(r.width, r.height) * 2;
      Object.assign(ripple.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - r.left - size / 2}px`, top: `${e.clientY - r.top - size / 2}px` });
      card.appendChild(ripple);
      gsap.fromTo(ripple, { scale: 0, opacity: 0.5 }, { scale: 1, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => ripple.remove() });
    });
  }
}
