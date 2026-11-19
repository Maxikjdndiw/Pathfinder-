/**
 * "Wie es funktioniert" as a scroll story.
 * Desktop (900 px and up, no reduced motion): the story is pinned for about four screen
 * heights; scrolling moves through the four steps, the card on the right shows the scene of
 * the active step and a thin bar shows the progress.
 * Phones and reduced motion: nothing happens here, the steps stay stacked with their own card.
 *
 * Only transform and opacity change while scrolling; layout is never read per frame.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './scroll-story.css';

gsap.registerPlugin(ScrollTrigger);

export function initScrollStory(root: HTMLElement): void {
  const steps = [...root.querySelectorAll<HTMLElement>('.story__step')];
  const card = root.querySelector<HTMLElement>('.story__card');
  const bar = root.querySelector<HTMLElement>('.story__progress span');
  if (!steps.length || !card || !bar) return;

  // stagger index for the CSS animations (data-k is the order elements appear in)
  root.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => el.style.setProperty('--k', el.dataset.k!));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('js-anim');

  // stacked layout (phones): each card plays its animation once when it scrolls into view
  if (!reduce) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.querySelector('.sc')?.classList.add('is-active');
          io.unobserve(e.target);
        }),
      { threshold: 0.35 },
    );
    root.querySelectorAll('.story__visual').forEach((v) => io.observe(v));
  }

  // the card on the right gets a copy of each step's scene (decorative, hidden from screen readers)
  const scenes = steps.map((step) => {
    const scene = step.querySelector<HTMLElement>('.story__visual .sc')!.cloneNode(true) as HTMLElement;
    card.appendChild(scene);
    return scene;
  });

  let active = -1;
  const show = (i: number) => {
    if (i === active) return;
    active = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    scenes.forEach((s, k) => s.classList.toggle('is-active', k === i));
  };

  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    root.classList.add('is-story');
    show(0);
    const setBar = gsap.quickSetter(bar, 'scaleY');
    const st = ScrollTrigger.create({
      trigger: root,
      // centred in the space below the header; read once per refresh, never per frame
      start: () => {
        const free = window.innerHeight - 96;
        return root.offsetHeight <= free ? `center ${96 + free / 2}px` : 'top 96px';
      },
      end: () => `+=${window.innerHeight * 3}`,
      pin: true,
      pinSpacing: true,
      scrub: true,
      anticipatePin: 1,
      onUpdate: (self) => {
        setBar(self.progress);
        show(Math.min(steps.length - 1, Math.floor(self.progress * steps.length)));
      },
    });
    return () => {
      st.kill();
      root.classList.remove('is-story');
      steps.forEach((s) => s.classList.remove('is-active'));
      scenes.forEach((s) => s.classList.remove('is-active'));
      active = -1;
    };
  });
}
