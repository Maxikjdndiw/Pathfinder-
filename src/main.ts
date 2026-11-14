import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SIGNUP_URL } from './config';
import { CARDS } from './content/cards';
import type { SceneState } from './scene';

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
    start: 'top 88%',
    once: true,
    onEnter: (els) =>
      gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, overwrite: true }),
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
      .then(({ createScene }) => createScene(container!, state))
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
