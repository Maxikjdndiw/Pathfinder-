/**
 * "Netzwerk" section: tile list / fallback grid and the sphere (lazy).
 * Loaded after the first paint (see main.ts), the sphere and Three.js only when the
 * section comes near the viewport.
 */
import { NETWORK_GROUP_LABELS, NETWORK_TILES, type NetworkTile } from '../data/networkTiles';
import type { SphereControls } from './sphere';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initNetwork(): void {
  const section = document.getElementById('netzwerk');
  if (!section) return;
  const root = document.documentElement;
  const grid = section.querySelector<HTMLElement>('#network-grid')!;
  const sphereBox = section.querySelector<HTMLElement>('#network-sphere')!;
  const base = import.meta.env.BASE_URL;

  // The list of all 14 topics. Visible as a grid without WebGL / with reduced motion,
  // otherwise kept for screen readers (links taken out of the tab order; keyboard users
  // use the sphere buttons instead).
  grid.innerHTML = NETWORK_TILES.map(
    (t) => `<li class="network__item">
      <a class="network__item-link" href="${t.href}">
        <img src="${base}${t.image}" alt="${esc(t.alt)}" width="1024" height="1024" loading="lazy" decoding="async">
        <span class="network__item-group">${NETWORK_GROUP_LABELS[t.group]}</span>
        <span class="network__item-title">${esc(t.title)}</span>
        <span class="network__item-text">${esc(t.description)}</span>
      </a>
    </li>`,
  ).join('');

  const use3D = root.classList.contains('has-3d');
  if (!use3D) {
    section.classList.add('network--static');
    return;
  }
  section.classList.add('network--sphere');
  grid.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', '-1'));

  const caption = {
    group: sphereBox.querySelector<HTMLElement>('[data-tile-group]')!,
    title: sphereBox.querySelector<HTMLElement>('[data-tile-title]')!,
    text: sphereBox.querySelector<HTMLElement>('[data-tile-text]')!,
  };
  const show = (t: NetworkTile, moving: boolean) => {
    sphereBox.classList.toggle('is-moving', moving);
    if (caption.title.textContent === t.title) return;
    caption.group.textContent = NETWORK_GROUP_LABELS[t.group];
    caption.title.textContent = t.title;
    caption.text.textContent = t.description;
  };
  show(NETWORK_TILES[0], false);

  const io = new IntersectionObserver(
    async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      try {
        const { createSphere } = await import('./sphere');
        const sphere = createSphere(sphereBox.querySelector<HTMLElement>('.network__canvas')!, {
          tiles: NETWORK_TILES,
          onActive: show,
        }) as SphereControls | null;
        if (!sphere) throw new Error('no WebGL');
        sphereBox.classList.add('is-ready');
        sphereBox.querySelector('[data-sphere-prev]')!.addEventListener('click', () => sphere.prev());
        sphereBox.querySelector('[data-sphere-next]')!.addEventListener('click', () => sphere.next());
        sphereBox.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') sphere.prev();
          else if (e.key === 'ArrowRight') sphere.next();
        });
      } catch {
        // WebGL failed: show the grid instead
        section.classList.remove('network--sphere');
        section.classList.add('network--static');
        grid.querySelectorAll('a').forEach((a) => a.removeAttribute('tabindex'));
      }
    },
    { rootMargin: '600px 0px' },
  );
  io.observe(sphereBox);
}
