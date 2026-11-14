/**
 * Result card markup (front + back), shared by the quiz result and the homepage example.
 * Behaviour comes from components/tilted-card.ts.
 */
import { COPY, type Archetype } from './content';
import { TiltedCard } from '../components/tilted-card';
import './card.css';

export interface CardData {
  archetype: Archetype;
  blend: { name: string; percent: number }[];
  top: { name: string; percent: number }[];
  wildcard: { name: string; percent: number };
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ROTATE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const BAR_COLORS = ['var(--oxblood)', 'var(--ocean)', 'var(--ink)'];

export function resultCardHTML(d: CardData): string {
  const r = COPY.result;
  return `
  <div class="tc result-card">
    <div class="tc__shadow" aria-hidden="true"></div>
    <div class="tc__float">
      <div class="tc__card">
        <div class="tc__face tc__face--front rc-front">
          <img class="rc-photo" src="${esc(d.archetype.photo)}" alt="" draggable="false">
          <div class="rc-shade"></div>
          <div class="rc-top" data-depth="15">
            <img class="rc-mark" src="/pathfinder-mark-dark.svg" alt="" width="64" height="64"><span>${r.brand}</span>
          </div>
          <div class="rc-bottom" data-depth="30">
            <span class="rc-label">${r.yourType}</span>
            <span class="rc-name">${esc(d.archetype.name)}</span>
            <span class="rc-line">${esc(d.archetype.line)}</span>
          </div>
          <span class="rc-hint">${ROTATE_ICON}${r.flipHint}</span>
          <span class="tc__glare"></span><span class="tc__edge"></span>
        </div>
        <div class="tc__face tc__face--back rc-back">
          <span class="rc-heading">${r.mixHeading}</span>
          <ul class="rc-bars">
            ${d.blend
              .map(
                (b, i) => `<li class="rc-bar"><span class="rc-bar__label"><span>${esc(b.name)}</span><span>${b.percent} %</span></span>
                <span class="rc-bar__track"><span class="rc-bar__fill" style="--p:${b.percent}%;--c:${BAR_COLORS[i] ?? 'var(--ink)'}"></span></span></li>`,
              )
              .join('')}
          </ul>
          <span class="rc-divider"></span>
          <span class="rc-heading rc-heading--small">${r.pathsHeading}</span>
          <ul class="rc-paths">
            ${d.top.map((f) => `<li><span>${esc(f.name)}</span><span class="rc-pct">${f.percent} %</span></li>`).join('')}
          </ul>
          <span class="rc-wild"><span class="rc-wild__tag">${r.wildcard}</span><span>${esc(d.wildcard.name)}</span><span class="rc-pct">${d.wildcard.percent} %</span></span>
          <span class="rc-foot"><img class="rc-mark" src="/pathfinder-mark.svg" alt="" width="64" height="64"><span>Pathfinder</span></span>
          <span class="tc__glare"></span><span class="tc__edge"></span>
        </div>
      </div>
    </div>
  </div>`;
}

/** Text version of the card for screen readers */
export function resultCardSummary(d: CardData): string {
  return `${COPY.result.yourType}: ${d.archetype.name}. ${d.archetype.line} ${COPY.result.mixHeading}: ${d.blend
    .map((b) => `${b.name} ${b.percent} %`)
    .join(', ')}. ${COPY.result.pathsHeading}: ${d.top.map((f) => `${f.name} ${f.percent} %`).join(', ')}. ${COPY.result.wildcard}: ${d.wildcard.name} ${d.wildcard.percent} %.`;
}

/** Renders the card into `host` and makes it tilt and flip */
export function mountResultCard(host: HTMLElement, d: CardData, opts: { intro?: boolean } = {}): TiltedCard {
  host.innerHTML = `${resultCardHTML(d)}<p class="sr-only">${esc(resultCardSummary(d))}</p>`;
  const el = host.querySelector<HTMLElement>('.result-card')!;
  return new TiltedCard(el, {
    rotateAmplitude: 12,
    scaleOnHover: 1.04,
    glare: 0.35,
    glareColor: '#F4F2EE',
    shadow: 0.5,
    radius: 24,
    smoothness: 0.6,
    intro: opts.intro ?? true,
    floating: true,
    label: COPY.result.cardLabel(d.archetype.name),
    onFlip: (back) => el.classList.toggle('rc--bars-on', back),
  });
}
