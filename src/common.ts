/**
 * Shared by every page with the site header: sign-up links, nav letter wave,
 * liquid glass on the nav.
 */
import { SIGNUP_URL } from './config';
import { initSvgLiquidGlass } from './liquidGlass';

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

/** Header: real liquid glass (refraction at the rim, slight blur, no colour fringe).
    Chromium only; other browsers keep the frosted glass from sections.css. */
export function initNavGlass(): void {
  const nav = document.querySelector<HTMLElement>('.nav');
  if (nav) initSvgLiquidGlass([nav], { prefix: 'nav-glass', blur: 5, chromatic: false });
}
