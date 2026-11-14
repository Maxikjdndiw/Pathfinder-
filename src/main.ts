import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SIGNUP_URL } from './config';
import { CARDS } from './content/cards';
import type { SceneState } from './scene';
import { initSvgLiquidGlass } from './liquidGlass';
import { initBorderGlow } from './borderGlow';
import type { WarpTextHandle } from './warpText';

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

/* Nav links: split into letters for the hover/focus wave. Screen readers get the
   full word through aria-label; the letter spans are hidden from them. */
document.querySelectorAll<HTMLAnchorElement>('.nav__links a').forEach((link) => {
  const text = link.textContent?.trim() ?? '';
  if (!text || link.querySelector('.wave')) return;
  link.setAttribute('aria-label', text);
  const chars = [...text];
  const step = Math.min(14, 170 / chars.length); // whole wave stays around 300-400 ms
  link.innerHTML = `<span class="wave" aria-hidden="true">${chars
    .map((c, i) => `<span style="--d:${(i * step).toFixed(0)}ms">${c === ' ' ? '&nbsp;' : c}</span>`)
    .join('')}</span>`;
});

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
let roadCaption: WarpTextHandle | null = null;
let roadCaptionShown = false;

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
    .call(() => {
      roadCaptionShown = true;
      roadCaption?.start();
    }, [], 0.74)
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
      .then(async () => {
        // road caption: warped text (WarpText from React Bits, ported), no box
        const box = document.querySelector<HTMLElement>('.hero__warp');
        if (!box) return;
        const mod = await import('./warpText').catch(() => null);
        if (!mod) return; // the caption simply stays hidden
        roadCaption = mod.createWarpText(box, {
          text: box.dataset.text ?? '',
          color: '#141517',
          lineColors: [undefined, undefined, '#6A1311'],
          halo: { color: 'rgba(232, 231, 227, 0.75)', blur: 44 },
          fontFamily: '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(30px, 4.2vw, 60px)',
          letterSpacing: '-0.02em',
          lineHeight: 1.04,
          warpStrength: 0.06,
          warpScale: 1.7,
          speed: 0.5,
          lens: 'bulge',
          pointerInfluence: 0.38,
          pointerStrength: 0.34,
          refraction: 0.016,
          chromatic: 0.25,
          idleDrift: 0.15,
          ripple: true,
          clickRipple: true,
          intro: true,
        });
        if (roadCaptionShown) roadCaption?.start();
      })
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

/* 7. Founder badge on a lanyard (React Bits Lanyard, ported). Loaded only when the
   founder section comes near, so it never slows down the first screen. */
const lanyardBox = document.getElementById('founder-lanyard');
if (lanyardBox) {
  const badge = lanyardBox.closest<HTMLElement>('.founder__badge')!;
  const io = new IntersectionObserver(
    async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const { founderArtwork } = await import('./lanyard/founderCard');
      const art = await founderArtwork();
      let lanyard = null;
      if (root.classList.contains('has-3d') || reduceMotion) {
        const { createLanyard } = await import('./lanyard/lanyard.js');
        lanyard = createLanyard(lanyardBox, {
          ...art,
          cardColor: '#F4F2EE',
          strapColor: '#6A1311',
          finish: 'glossy',
          metal: 'graphite',
          cornerRadius: 0.35,
          size: 0.6,
          strapLength: 0.52,
          strapWidth: 0.7,
          breeze: 0.35,
          damping: 0.55,
        });
      }
      if (lanyard) {
        if (!window.matchMedia('(hover: hover)').matches) {
          const hint = badge.querySelector('.founder__hint');
          if (hint) hint.textContent = 'Zieh an der Karte. Tippen dreht sie um.';
        }
        badge.classList.add('is-live');
      }
      else {
        // no WebGL: a still image of the same card
        lanyardBox.remove();
        badge.querySelector('.founder__hint')?.remove();
        const img = new Image();
        img.className = 'founder__still';
        img.src = art.frontImage;
        img.alt = '';
        badge.appendChild(img);
      }
    },
    { rootMargin: '600px 0px' },
  );
  io.observe(lanyardBox);
}

/* 8. Border glow (React Bits BorderGlow, adapted) on the regular cards.
   The liquid glass elements (nav, tags, hero) keep their own effect. */
if (window.matchMedia('(hover: hover)').matches) {
  initBorderGlow(document.querySelectorAll<HTMLElement>('.step, .tip-card'));
  // cards on the ocean panel: glow in the light card colour so it shows on blue
  initBorderGlow(document.querySelectorAll<HTMLElement>('.why__point'), { glowColor: '40 25 94', colors: ['#6A1311', '#6FA3BE', '#F4F2EE'] });
}
