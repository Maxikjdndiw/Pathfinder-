/**
 * Shared by every page with the site header: sign-up links, nav letter wave,
 * pointer light on glass, liquid glass on the nav.
 */
import { SIGNUP_URL } from './config';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Every "Kostenlos mitmachen" button uses the one link from src/config.ts, in a new tab */
export function initSignupLinks(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>('[data-signup]').forEach((a) => {
    a.href = SIGNUP_URL;
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

/** Nav links: letters wave on hover/focus. Screen readers get the word via aria-label. */
export function initNavWave(): void {
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
}

/** Light that follows the pointer on glass elements */
export function initShine(root: ParentNode = document): void {
  if (reduceMotion() || !window.matchMedia('(hover: hover)').matches) return;
  root.querySelectorAll<HTMLElement>('[data-shine]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}
