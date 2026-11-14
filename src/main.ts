import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SIGNUP_URL } from './config';
import { CARDS } from './content/cards';
import type { SceneState } from './scene';
import { initSvgLiquidGlass } from './liquidGlass';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1. Every "Kostenlos mitmachen" button uses the one link from src/config.ts */
document.querySelectorAll<HTMLAnchorElement>('[data-signup]').forEach((a) => {
  a.href = SIGNUP_URL;
  a.target = '_blank';
  a.rel = 'noopener';
});

/* 2. Static card grid (used when there is no 3D) */
function renderCardGrid(): void {
  const grid = document.getElementById('card-grid');
  if (!grid || grid.childElementCount) return;
  const base = import.meta.env.BASE_URL;
  grid.innerHTML = CARDS.slice(0, 12)
    .map((c) => {
      const style = c.image
        ? ` style="background-image:linear-gradient(180deg,rgba(20,21,23,.7),rgba(20,21,23,.1)),url('${base}${c.image.replace(/^\//, '')}');color:var(--card)"`
        : '';
      return `<li class="path-card path-card--${c.variant}"${style}>
        <span class="path-card__kind">${c.kind}</span>
        <span class="path-card__title">${c.title}</span>
        <span class="path-card__detail">${c.detail}</span>
      </li>`;
    })
    .join('');
}

function fallbackTo2D(): void {
  root.classList.remove('has-3d');
  root.classList.add('no-3d');
  renderCardGrid();
  ScrollTrigger.getAll().forEach((t) => {
    if (t.vars.trigger === '.hero') t.kill(true);
  });
  gsap.set('[data-hero-content], .hero__veil, .hero__caption, .scroll-hint', { clearProps: 'all' });
  ScrollTrigger.refresh();
}

if (root.classList.contains('no-3d')) renderCardGrid();

/* 3. Light that follows the pointer on glass elements */
if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
  document.querySelectorAll<HTMLElement>('[data-shine]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/* 4. Scroll animations */
if (!reduceMotion) {
  root.classList.add('js-reveal');
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top bottom-=24px', // animate as soon as it enters, so nothing sits half-faded on screen
    once: true,
    // starts at 0.6 opacity (see base.css), so text is readable during the whole animation
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.05, overwrite: true }),
  });
}

/* 5. The 3D scene: scroll story + lazy loaded Three.js */
const state: SceneState = { s: 0 };

if (root.classList.contains('has-3d')) {
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: 0.8 },
  });
  // stage value read by the scene every frame: 0 ring → 1 wall → 2 road → travel
  tl.to(state, { s: 1, duration: 0.3 }, 0.16)
    .to(state, { s: 2, duration: 0.28 }, 0.52)
    .to(state, { s: 2.7, duration: 0.2 }, 0.8)
    .to('.scroll-hint', { autoAlpha: 0, duration: 0.04 }, 0)
    .to('[data-hero-content], .hero__veil', { autoAlpha: 0, y: -80, duration: 0.14 }, 0.12)
    .to('[data-caption="1"]', { autoAlpha: 1, duration: 0.06 }, 0.36)
    .to('[data-caption="1"]', { autoAlpha: 0, duration: 0.05 }, 0.56)
    .to('[data-caption="2"]', { autoAlpha: 1, duration: 0.06 }, 0.74)
    .to({}, { duration: 0.04 }, 0.96);

  const container = document.getElementById('scene');
  const load = () =>
    import('./scene')
      .then(({ createScene }) =>
        createScene(container!, state, {
          hero: document.querySelector<HTMLElement>('.hero')!,
          forceGlass: new URLSearchParams(location.search).get('glass') === 'force', // testing only
          glass: [
            { el: document.querySelector<HTMLElement>('.nav')!, tint: 0.5, whileOverScene: true },
            { el: document.querySelector<HTMLElement>('.hero__sub')!, tint: 0.5 },
            ...[...document.querySelectorAll<HTMLElement>('.hero__caption')].map((el) => ({ el, tint: 0.48 })),
          ],
        }),
      )
      .catch((err) => {
        console.warn('3D scene unavailable, showing static cards instead.', err);
        fallbackTo2D();
      });

  // Wait until the first screen is painted and the page is idle, then load Three.js
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 1200 }) : setTimeout(cb, 300);
  if (document.readyState === 'complete') idle(load);
  else window.addEventListener('load', () => idle(load), { once: true });
}

/* 6. Liquid glass (SVG refraction) for the field tags and the nav outside the hero.
   Chromium only; Safari and Firefox keep the frosted glass. */
const svgGlassTargets = [
  document.querySelector<HTMLElement>('.nav'),
  ...document.querySelectorAll<HTMLElement>('.tag'),
].filter((el): el is HTMLElement => !!el);
const stopSvgGlass = initSvgLiquidGlass(svgGlassTargets);

// Phones: if scrolling gets choppy, fall back to the plain frosted glass.
const forceGlass = new URLSearchParams(location.search).get('glass') === 'force';
if (!forceGlass && window.matchMedia('(max-width: 760px)').matches && root.classList.contains('has-svg-glass')) {
  const deltas: number[] = [];
  let last = 0;
  let sampling = false;
  const sample = (t: number) => {
    if (last) deltas.push(t - last);
    last = t;
    if (deltas.length < 90) requestAnimationFrame(sample);
    else {
      const sorted = [...deltas].sort((a, b) => a - b);
      if (sorted[Math.floor(sorted.length / 2)] > 24) stopSvgGlass();
    }
  };
  const onFirstScroll = () => {
    if (sampling) return;
    sampling = true;
    window.removeEventListener('scroll', onFirstScroll);
    requestAnimationFrame(sample);
  };
  window.addEventListener('scroll', onFirstScroll, { passive: true });
}
