import './styles/index.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initNavWave, initShine, initSignupLinks } from './common';
import { createCardSwap } from './components/card-swap';
import { MENTORS } from './content/mentors';
import './components/topography.css'; // the static map fallback needs it before the WebGL chunk loads
import { initSvgLiquidGlass } from './liquidGlass';
import { initBorderGlow } from './borderGlow';
import { mountResultCard } from './quiz/card';
import { ARCHETYPES } from './quiz/content';

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 1. Every "Kostenlos mitmachen" button uses the one link from src/config.ts */
initSignupLinks();

/* Nav links: letter wave on hover/focus (src/common.ts) */
initNavWave();

/* 3. Light that follows the pointer on glass elements (the steps) */
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

/* 5. Hero: card stack (React Bits Card Swap, rebuilt) and the contour map background
   (React Bits Topography, rebuilt). Reduced motion: static stack and the static map. */
const heroStack = document.getElementById('hero-stack');
if (heroStack) createCardSwap(heroStack);

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

/* 6. Scroll transition into "Für wen": the stack moves up and fades, the text fades a little.
   On phones the stack sits below the text, so it moves only a few pixels and never reaches it. */
if (!reduceMotion) {
  const mm = gsap.matchMedia();
  const scrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 };
  mm.add('(min-width: 900px)', () => {
    gsap.to('[data-hero-stack]', { y: -120, autoAlpha: 0, ease: 'none', scrollTrigger: scrub });
    gsap.to('[data-hero-text]', { autoAlpha: 0.35, ease: 'none', scrollTrigger: scrub });
  });
  mm.add('(max-width: 899px)', () => {
    gsap.to('[data-hero-stack]', { y: -16, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-hero-stack]', start: 'top 35%', end: 'bottom top', scrub: 0.6 } });
    gsap.to('[data-hero-text]', { autoAlpha: 0.5, ease: 'none', scrollTrigger: { trigger: '[data-hero-text]', start: 'top top', end: 'bottom top', scrub: 0.6 } });
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
   The liquid glass tags keep their own effect. */
// Mouse/trackpad only (touch is ignored inside); no (hover: hover) gate, which some
// touchscreen laptops report as false even when a mouse is used.
{
  initBorderGlow(document.querySelectorAll<HTMLElement>('.step'));
  // cards on the ocean panel: glow in the light card colour so it shows on blue
  initBorderGlow(document.querySelectorAll<HTMLElement>('.why__point'), { glowColor: '40 25 94', colors: ['#6A1311', '#6FA3BE', '#F4F2EE'] });
}

/* 9. Insider tips: mentor cards (data in src/content/mentors.ts). "Mehr erfahren" leads to
   the signup, because the full tips unlock after signing up. */
{
  const grid = document.getElementById('mentor-grid');
  if (grid) {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const base = import.meta.env.BASE_URL;
    grid.innerHTML = MENTORS.map(
      (m) => `
      <article class="mentor mentor--${m.accent}">
        <a class="mentor__rail" href="#signup" aria-label="Mehr erfahren: alle Tipps von ${esc(m.name)} nach der Anmeldung">Mehr erfahren <span aria-hidden="true">←</span></a><!-- the rail is rotated, so this arrow points down to the signup -->
        <div class="mentor__body">
          <div class="mentor__head">
            <span class="mentor__photo">${m.photo ? `<img src="${base}${esc(m.photo)}" alt="" loading="lazy">` : '<svg viewBox="0 0 100 110" aria-hidden="true"><circle cx="50" cy="38" r="22" fill="currentColor"/><path d="M8 110c0-26 19-42 42-42s42 16 42 42z" fill="currentColor"/></svg>'}</span>
            <div>
              <h3 class="mentor__name">${esc(m.name)}</h3>
              <p class="mentor__role">${esc(m.role)}</p>
            </div>
          </div>
          <ul class="mentor__tips">${m.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
      </article>`,
    ).join('');
  }
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
