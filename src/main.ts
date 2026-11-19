import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initNavGlass, initNavWave, initSignupLinks } from './common';
import { initHeroTrail } from './components/hero-trail';
import './components/topography.css'; // the static map fallback needs it before the WebGL chunk loads
import { initSvgLiquidGlass } from './liquidGlass';
import { mountResultCard } from './quiz/card';
import { ARCHETYPES } from './quiz/content';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1. Every "Kostenlos mitmachen" button uses the one link from src/config.ts */
initSignupLinks();
initNavGlass();

/* Nav links: letter wave on hover/focus (src/common.ts) */
initNavWave();

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

/* 5. Hero: trail with 12 stops (src/components/hero-trail.ts). The contour canvas below
   serves "Für wen"; the hero has its own CSS map on top of it. */
const heroTrail = document.querySelector<HTMLElement>('[data-hero-trail]');
if (heroTrail) initHeroTrail(heroTrail);

{
  const surface = document.getElementById('topo-surface');
  if (surface && root.classList.contains('has-3d')) {
    // the static map is never shown when WebGL works
    const start = () =>
      import('./components/topography').then(({ createTopography }) => {
        if (!createTopography({ surface, fadeFrom: 0.62 })) root.classList.add('topo-static');
      });
    // after load, when the page is idle: the first screen never waits for it
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300));
    if (document.readyState === 'complete') idle(start);
    else window.addEventListener('load', () => idle(start), { once: true });
  }
}

/* 6. Scroll transition into "Für wen": the trail and the text fade a little. */
if (!reduceMotion) {
  const mm = gsap.matchMedia();
  const scrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
  mm.add('(min-width: 900px)', () => {
    gsap.to('[data-hero-trail]', { autoAlpha: 0.35, ease: 'none', scrollTrigger: scrub });
    gsap.to('[data-hero-text]', { autoAlpha: 0.35, ease: 'none', scrollTrigger: scrub });
  });
  mm.add('(max-width: 899px)', () => {
    gsap.to('[data-hero-text]', { autoAlpha: 0.5, ease: 'none', scrollTrigger: { trigger: '[data-hero-text]', start: 'top top', end: 'bottom top', scrub: true } });
  });
}

/* Liquid glass (SVG refraction) for the field tags. Chromium only; others keep frosted glass. */
const svgGlassTargets = [...document.querySelectorAll<HTMLElement>('.tag')];
const stopSvgGlass = initSvgLiquidGlass(svgGlassTargets);

// Phones: if scrolling gets choppy, fall back to the plain frosted glass.
if (window.matchMedia('(max-width: 760px)').matches && root.classList.contains('has-svg-glass')) {
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
          cardColor: '#F5F5F7',
          strapColor: '#1D1D1F',
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

/* 9. Insider tips as a swapping card stack (React Bits CardSwap, ported).
   Only real cards from src/content/mentors.ts. Counter and arrows follow their number;
   with a single card there are no arrows. All cards share the height of the tallest one. */
const insiderStack = document.getElementById('insider-stack');
if (insiderStack) {
  Promise.all([import('./cardSwap'), import('./content/mentors')]).then(([{ createCardSwap, stackBounds }, { MENTORS }]) => {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const total = String(MENTORS.length).padStart(2, '0');
    const compact = window.matchMedia('(max-width: 560px)').matches;
    const num = (i: number) => `${String(i + 1).padStart(2, '0')} / ${total}`;
    // neutral default profile picture: light grey circle, grey head and shoulders
    const avatar =
      '<span class="insider__avatar" aria-hidden="true"><svg viewBox="0 0 56 56" width="56" height="56"><circle cx="28" cy="21" r="10" fill="#B0B0B0"/><ellipse cx="28" cy="52" rx="19" ry="15" fill="#B0B0B0"/></svg></span>';

    const real = MENTORS.map((m, i) => {
      const el = document.createElement('article');
      el.className = `insider insider--featured${compact ? ' insider--compact' : ''}`;
      el.innerHTML = `
        <div class="insider__top"><span class="insider__field">${esc(m.field)}</span><span class="insider__num">${num(i)}</span></div>
        <div class="insider__who">
          ${avatar}
          <div>
            <p class="insider__name">${esc(m.name)}</p>
            <p class="insider__role">${esc(m.role)}</p>
          </div>
        </div>
        <ul class="insider__bullets">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <a class="insider__more" href="#signup">Mehr erfahren <span aria-hidden="true">→</span></a>`;
      return el;
    });
    const cards = real;

    const geo = compact
      ? { cardDistance: 12, verticalDistance: 18, depth: 50, skewAmount: 2, visibleCards: Math.min(3, cards.length), pad: 10 }
      : { cardDistance: 40, verticalDistance: 46, depth: 80, skewAmount: 3, visibleCards: Math.min(4, cards.length), pad: 28 };
    // card width: as wide as the column allows (max 560), so the stage is never scaled down
    const avail = insiderStack.clientWidth || insiderStack.parentElement!.clientWidth;
    const boundsFor = (width: number, height: number) =>
      stackBounds({ width, height, cardDistance: geo.cardDistance, verticalDistance: geo.verticalDistance, depth: geo.depth, skewAmount: geo.skewAmount, visible: geo.visibleCards, hoverSpread: 0, pad: geo.pad });
    let width = compact ? 340 : 560;
    for (let k = 0; k < 4; k++) width = Math.floor(width - Math.max(0, boundsFor(width, 400).width - avail));
    width = Math.max(240, width);
    // height: measure the real cards at that width, the tallest sets every card
    const probe = document.createElement('div');
    probe.className = 'card-swap insider-probe';
    probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;width:${width}px`;
    document.body.appendChild(probe);
    let tallest = 0;
    for (const card of real) {
      const clone = card.cloneNode(true) as HTMLElement;
      clone.style.height = 'auto';
      probe.appendChild(clone);
      tallest = Math.max(tallest, clone.getBoundingClientRect().height);
      clone.remove();
    }
    const height = Math.max(compact ? 380 : 320, Math.ceil(tallest) + 2);
    probe.remove();

    const count = document.querySelector('[data-swap-count]');
    const totalEl = document.querySelector('[data-swap-total]');
    if (totalEl) totalEl.textContent = total;
    const several = cards.length > 1;
    // one card: no arrows, no counter, nothing to swap
    document.querySelector<HTMLElement>('.insiders__controls')?.toggleAttribute('hidden', !several);
    const swap = createCardSwap(insiderStack, cards, {
      ...geo,
      width,
      height,
      delay: 5000,
      autoplay: several && !reduceMotion,
      draggable: several,
      cardRadius: 24, // --radius-card
      dim: 0.45,
      hoverSpread: 0, // no fan out on hover
      parallax: 0, // no tilt towards the pointer
      label: 'Insider-Tipps',
      onChange: (i) => {
        if (count) count.textContent = String(i + 1).padStart(2, '0');
      },
    });
    insiderStack.classList.add('is-sized');
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
    { intro: false, still: true },
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
  // accent only: a light tint at the edge of the light, the accent at its core
  const BRAND_RAMP = ['#8DB8E8', '#3D8BDB', '#0066CC'];
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
            // full page width. The glow is brightest near the layer's lower edge, so the layer
            // ends a little under the tags: the light sits behind them and fades out softly
            // further down instead of being cut off by the section edge
            const top = Math.max(0, t.top - sct.top - 520);
            const bottom = Math.round(sct.bottom - t.bottom - 90);
            Object.assign(host.style, { left: '0px', width: '100%', top: `${Math.round(top)}px`, bottom: `${bottom}px`, height: 'auto' });
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

/* 13. Grainient in the pilot panel and, much lighter, in "Warum Pathfinder DE" (React Bits
   Grainient, ported). WebGL2 only; each panel's CSS gradient stays underneath as the fallback. */
{
  const panels: [string, Record<string, unknown>][] = [
    // accent to its hover blue, never lighter than the accent: white text stays above 4.5:1
    ['cta-grain', { colors: ['#004F9E', '#00559F', '#005AB4', '#0060C0', '#0066CC'], grainAmount: 0.12, contrast: 1 }],
    // the same flow, light: surface grey to light accent, dark text reads above 4.5:1
    ['why-grain', { colors: ['#F5F5F7', '#F1F3F8', '#EDF1F9', '#EAF1FA', '#E8F1FB'], grainAmount: 0.06 }],
  ];
  for (const [id, preset] of panels) {
    const host = document.getElementById(id);
    if (!host) continue;
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const { createGrainient } = await import('./grainient/grainient.js');
        const handle = createGrainient(host, {
          type: 'linear',
          angle: 150,
          // a soft fold of light, not a flat field
          flow: 1.6,
          scale: 1.4,
          silk: 0.8,
          contrast: 1.15,
          speed: 0.6,
          grainSize: 1,
          variation: 3,
          ...preset,
        });
        if (handle) host.classList.add('is-on');
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(host);
  }
}
