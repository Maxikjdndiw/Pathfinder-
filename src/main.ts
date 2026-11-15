import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initNavWave, initShine, initSignupLinks } from './common';
import { CARDS, spreadPhotoCards } from './content/cards';
import type { SceneState } from './scene';
import { initSvgLiquidGlass } from './liquidGlass';
import { initBorderGlow } from './borderGlow';
import { mountResultCard } from './quiz/card';
import { ARCHETYPES } from './quiz/content';
import type { WarpTextHandle } from './warpText';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1. Every "Kostenlos mitmachen" button uses the one link from src/config.ts */
initSignupLinks();

/* 2. Static card grid (used when there is no 3D) */
function renderCardGrid(): void {
  const grid = document.getElementById('card-grid');
  if (!grid || grid.childElementCount) return;
  const base = import.meta.env.BASE_URL;
  grid.innerHTML = spreadPhotoCards(CARDS)
    .slice(0, 12)
    .map((c) => {
      const img = c.image
        ? `<img class="path-card__img" src="${base}${c.image.replace(/^\//, '')}" alt="" loading="lazy" decoding="async" onerror="this.parentElement.classList.remove('path-card--photo');this.remove()">`
        : '';
      return `<li class="path-card path-card--${c.variant}${c.image ? ' path-card--photo' : ''}">
        ${img}
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

/* Nav links: letter wave on hover/focus (src/common.ts) */
initNavWave();

/* 3. Light that follows the pointer on glass elements */
initShine();

/* 4. Scroll animations */
if (!reduceMotion) {
  root.classList.add('js-reveal');
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top bottom-=24px', // animate as soon as it enters, so nothing sits half-faded on screen
    once: true,
    // slide-up only (see base.css), text stays fully opaque
    onEnter: (els) =>
      gsap.to(els, { y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.05, overwrite: true }),
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
// Mouse/trackpad only (touch is ignored inside); no (hover: hover) gate, which some
// touchscreen laptops report as false even when a mouse is used.
{
  initBorderGlow(document.querySelectorAll<HTMLElement>('.step'));
  // cards on the ocean panel: glow in the light card colour so it shows on blue
  initBorderGlow(document.querySelectorAll<HTMLElement>('.why__point'), { glowColor: '40 25 94', colors: ['#6A1311', '#6FA3BE', '#F4F2EE'] });
}

/* 9. Insider tips as a swapping card stack (React Bits CardSwap, ported). */
const insiderStack = document.getElementById('insider-stack');
if (insiderStack) {
  Promise.all([import('./cardSwap'), import('./content/insiders')]).then(([{ createCardSwap }, { INSIDERS }]) => {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const base = import.meta.env.BASE_URL;
    const total = String(INSIDERS.length).padStart(2, '0');
    const compact = window.matchMedia('(max-width: 560px)').matches;
    const cards = INSIDERS.map((p, i) => {
      const el = document.createElement('article');
      el.className = `insider insider--${p.accent}${compact ? ' insider--compact' : ''}`;
      el.innerHTML = `
        <div class="insider__photo">
          ${p.photo ? `<img src="${base}${esc(p.photo)}" alt="${esc(p.name)}" draggable="false">` : `
          <svg class="insider__silhouette" viewBox="0 0 100 110" aria-hidden="true"><circle cx="50" cy="38" r="22" fill="currentColor"/><path d="M8 110c0-26 19-42 42-42s42 16 42 42z" fill="currentColor"/></svg>
          <span class="insider__photo-tag">Foto folgt</span>`}
        </div>
        <div class="insider__body">
          <div class="insider__top"><span class="insider__field">${esc(p.field)}</span><span class="insider__num">${String(i + 1).padStart(2, '0')} / ${total}</span></div>
          <h3 class="insider__title">${esc(p.title)}</h3>
          <p class="insider__text">${esc(p.text)}</p>
          <div class="insider__person">
            <p class="insider__name">${esc(p.name)}</p>
            <dl class="insider__meta"><dt>Job</dt><dd>${esc(p.job)}</dd><dt>Studium</dt><dd>${esc(p.education)}</dd></dl>
          </div>
        </div>`;
      return el;
    });
    const count = document.querySelector('[data-swap-count]');
    const totalEl = document.querySelector('[data-swap-total]');
    if (totalEl) totalEl.textContent = total;
    const swap = createCardSwap(insiderStack, cards, {
      ...(compact
        ? { width: 300, height: 380, cardDistance: 16, verticalDistance: 24, depth: 60, skewAmount: 3, visibleCards: 3 }
        : { width: 500, height: 320, cardDistance: 46, verticalDistance: 52, depth: 90, skewAmount: 4, visibleCards: 4 }),
      delay: 5000,
      autoplay: !reduceMotion,
      cardRadius: 20,
      dim: 0.45,
      label: 'Tipps von Studierenden',
      onChange: (i) => {
        if (count) count.textContent = String(i + 1).padStart(2, '0');
      },
    });
    document.querySelector('[data-swap-prev]')?.addEventListener('click', () => swap.prev());
    document.querySelector('[data-swap-next]')?.addEventListener('click', () => swap.next());
  });
}

/* 10. Pathfinder Run teaser: example result card (Dealmaker), same component as the quiz */
const exampleHost = document.getElementById('example-card');
if (exampleHost) {
  const dealmaker = ARCHETYPES.find((a) => a.id === 'dealmaker')!;
  mountResultCard(
    exampleHost,
    {
      archetype: dealmaker,
      blend: [
        { name: 'Dealmaker', percent: 80 },
        { name: 'Mastermind', percent: 15 },
        { name: 'Creator', percent: 5 },
      ],
      top: [
        { name: 'Finance & Investment', percent: 92 },
        { name: 'Consulting & Strategie', percent: 86 },
      ],
      wildcard: { name: 'Gründen & Startups', percent: 81 },
    },
    { intro: false },
  );
}

/* 11. Netzwerk section: tile list, bento effects; sphere + Three.js only near the viewport */
{
  const startNetwork = () => import('./network').then(({ initNetwork }) => initNetwork());
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 400));
  if (document.readyState === 'complete') idle(startNetwork);
  else window.addEventListener('load', () => idle(startNetwork), { once: true });
}

/* 12. ASCII gradient behind "Für wen" and the final call to action (React Bits GradientASCII,
   ported). WebGL2 only; created when the section comes near, the CSS glow stays as fallback. */
{
  // light mode: from the edge of the light to its brightest point
  // blue only: ocean-light at the edge of the light, ocean at its core
  const BRAND_RAMP = ['#6FA3BE', '#3f87ab', '#096996'];
  const presets: Record<string, import('./gradientAscii/gradientAscii').GradientAsciiOptions> = {
    // a radial glow rising from the section's lower edge (cropped by it), behind the tags
    fields: { shape: 'rise', scale: 1.1, variation: 2, gradientOpacity: 0.8, glyphOpacity: 0.7 },
  };
  document.querySelectorAll<HTMLElement>('[data-ascii]').forEach((host) => {
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const { createGradientAscii } = await import('./gradientAscii/gradientAscii.js');
        const handle = createGradientAscii(host, {
          colors: BRAND_RAMP,
          lightMode: true,
          characters: ' .:+=xX#',
          cellSize: 16,
          density: 0.85,
          glyphOpacity: 0.8,
          gradientOpacity: 0.85,
          glow: 0.25,
          flicker: 0.15,
          softness: 0.7,
          flow: 0.6,
          speed: 0.6,
          grain: 0.04,
          clickEffect: 'wave',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          ...presets[host.dataset.ascii ?? ''],
        });
        if (handle) host.classList.add('is-on');
        // "Für wen": size the band layer to the tags, so it never runs behind the text
        if (host.dataset.ascii === 'fields') {
          const fit = () => {
            const tags = host.parentElement?.querySelector<HTMLElement>('.tags');
            const section = host.parentElement;
            if (!tags || !section) return;
            const t = tags.getBoundingClientRect();
            const sct = section.getBoundingClientRect();
            // a box centred on the tags: it starts at their middle and ends at the section edge,
            // so the glow rises from just under the tags and the edge crops it
            const pad = Math.min(160, sct.width * 0.12);
            const left = Math.max(0, t.left - sct.left - pad);
            const width = Math.min(sct.width - left, t.width + pad * 2);
            // the layer starts well above the tags so the round glow has room to form;
            // its brightest part ends up just under the tags, the section edge crops the rest
            const top = Math.max(0, t.top - sct.top - t.height * 1.1);
            Object.assign(host.style, { left: `${Math.round(left)}px`, width: `${Math.round(width)}px`, top: `${Math.round(top)}px`, bottom: '0px', height: 'auto' });
          };
          fit();
          new ResizeObserver(fit).observe(host.parentElement!);
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(host);
  });
}

/* 13. Grainient in the final call to action panel (React Bits Grainient, ported). WebGL2 only;
   the panel's CSS gradient stays underneath as the fallback. */
{
  const host = document.getElementById('cta-grain');
  if (host) {
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const { createGrainient } = await import('./grainient/grainient.js');
        const handle = createGrainient(host, {
          // dark brand ramp: light text stays readable on every colour
          // our blues only; the lightest stays dark enough for the light text
          colors: ['#021c29', '#043a55', '#075a82', '#096996', '#1b78a4'],
          type: 'linear',
          angle: 150,
          // a soft fold of light like the reference, not a flat field
          flow: 1.6,
          scale: 1.4,
          silk: 0.8,
          contrast: 1.15,
          speed: 0.6,
          // dense, fine film grain like the reference
          grainAmount: 0.16,
          grainSize: 1,
          variation: 3,
        });
        if (handle) host.classList.add('is-on');
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(host);
  }
}
