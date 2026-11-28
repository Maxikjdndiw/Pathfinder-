/**
 * Student dashboard after login: greeting with a prompt box, two story cards and
 * "Meine Fristen" (deadlines of saved offers only). The news ticker sits in the header.
 * All texts come from app-data/dashboard.json; deadlines from app-data/angebote.json.
 * A missing or empty part of the data hides that section quietly.
 */
import './dashboard.css';
import content from '../../app-data/dashboard.json';
import { FIELD_LABEL, formatDate, OFFERS, TYP_LABEL, type Offer } from './offers';

interface TickerItem {
  id?: string;
  text: string;
  url: string;
  source?: string;
  lastVerified?: string;
}
interface BigNews {
  id?: string;
  label?: string;
  title?: string;
  teaser?: string;
  body?: string;
  source?: string;
  url?: string;
  verified?: string;
  image?: string;
}
interface DayInLife {
  id?: string;
  label?: string;
  markdown?: string;
  image?: string;
  /** drawing for the [image: ...] placeholder inside the article */
  illustration?: string;
}
/** further articles in the same format as dayInLife */
interface Article extends DayInLife {
  /** labels for the paragraphs that start with **Urteil: (Mythos, Wahr, Teils, Übertrieben) */
  urteile?: string[];
}
type Slot = 'morgen' | 'mittag' | 'nachmittag' | 'abend' | 'nacht';
interface Content {
  artikel?: Article[];
  ticker?: TickerItem[];
  bigNews?: BigNews;
  dayInLife?: DayInLife;
  greetings?: Partial<Record<Slot, string[]>>;
}

export interface DashboardContext {
  name: string;
  felder: string[];
  saved: string[];
  /** opens the assistant; with a question it is sent right away */
  ask(question?: string): void;
  openMentor(): void;
  unsave(id: string): void;
}

const data = content as Content;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const safeUrl = (u: unknown) => (typeof u === 'string' && /^(https?:\/\/|\/)/.test(u) ? u : '');
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isIso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** suggestion chips under the prompt box */
export const SUGGESTIONS = ['Welche Fristen enden bald?', 'Was passt zu meinen Interessen?', 'Wie wird mein Lebenslauf stärker?'];

// ---------- content lookup (also used by the chat for source chips) ----------
export interface SourceRef {
  name: string;
  url: string;
  verified: string;
}
/** a source for an id from angebote.json or from dashboard.json */
export function sourceFor(id: string): SourceRef | null {
  const o = OFFERS.find((x) => x.id === id);
  if (o) return { name: o.anbieter || o.name, url: safeUrl(o.link), verified: o.zuletzt_geprueft };
  const t = data.ticker?.find((x) => x.id === id);
  if (t) return { name: text(t.source) || text(t.text), url: safeUrl(t.url), verified: isIso(t.lastVerified) ? t.lastVerified : '' };
  if (data.bigNews?.id === id) return { name: text(data.bigNews.source), url: safeUrl(data.bigNews.url), verified: isIso(data.bigNews.verified) ? data.bigNews.verified : '' };
  if (data.dayInLife?.id === id) return { name: text(data.dayInLife.label) || 'Ein Tag im Leben', url: '', verified: '' };
  return null;
}

// ---------- greeting ----------
export function timeSlot(h: number): Slot {
  if (h >= 5 && h < 11) return 'morgen';
  if (h >= 11 && h < 14) return 'mittag';
  if (h >= 14 && h < 18) return 'nachmittag';
  if (h >= 18 && h < 22) return 'abend';
  return 'nacht';
}
/** a random line for this time of day; without a name the name part is dropped */
export function greetingLine(name: string, hour = new Date().getHours(), pick = Math.random): string {
  const pool = (data.greetings?.[timeSlot(hour)] ?? []).filter((l) => typeof l === 'string' && l.trim());
  const line = pool.length ? pool[Math.floor(pick() * pool.length)] : 'Hallo, {name}.';
  const n = name.trim();
  return (n ? line.replaceAll('{name}', n) : line.replace(/,\s*\{name\}/g, '').replace(/\s*\{name\}/g, '')).replace(/\s+([.?!])/g, '$1');
}

// ---------- deadlines ----------
const DAY = 86_400_000;
const midnight = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
export function daysLeft(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - midnight(today)) / DAY);
}
export const daysLabel = (n: number) => (n < 0 ? 'abgelaufen' : n === 0 ? 'endet heute' : n === 1 ? 'noch 1 Tag' : `noch ${n} Tage`);

/** saved offers, the ones with a date first and sorted by it */
export function myDeadlines(saved: string[], today = new Date()): { offer: Offer; days: number | null }[] {
  return saved
    .map((id) => OFFERS.find((o) => o.id === id))
    .filter((o): o is Offer => Boolean(o))
    .map((offer) => ({ offer, days: isIso(offer.frist) ? daysLeft(offer.frist, today) : null }))
    .sort((a, b) => (a.days === null ? 1 : 0) - (b.days === null ? 1 : 0) || (a.offer.frist ?? '').localeCompare(b.offer.frist ?? ''));
}
const MONTHS = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// ---------- a very small markdown reader for the story (headings, paragraphs, lists, italics) ----------
const inline = (t: string) =>
  esc(t.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/&#91;/g, '['))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\s*\[(\d+)\]/g, '<sup class="dash-story__ref">$1</sup>');
const VERDICT_CLASS: Record<string, string> = { mythos: 'mythos', wahr: 'wahr', teils: 'teils', 'übertrieben': 'uebertrieben' };

function storyParts(md: string, illustration = '', urteile: string[] = []): { title: string; teaser: string; html: string; sources: { label: string; url: string }[] } {
  const lines = md.replace(/\r/g, '').split('\n');
  let title = '';
  const blocks: string[] = [];
  const sources: { label: string; url: string }[] = [];
  let inSources = false;
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`);
    list = [];
  };
  let teaser = '';
  let verdict = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      flush();
      inSources = /^quellen$/i.test(h[2].trim());
      if (!inSources) blocks.push(h[1] === '##' ? `<h3>${inline(h[2])}</h3>` : `<h4>${inline(h[2])}</h4>`);
      continue;
    }
    if (inSources) {
      // "1. Label. https://..." or "- [Label](https://...)"
      const md = line.match(/^-\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
      const m = md ? null : line.match(/^\d+\.\s+(.*?)\s*(https?:\/\/\S+)?$/);
      if (md) sources.push({ label: md[1], url: md[2] });
      else if (m) sources.push({ label: m[1].replace(/\.\s*$/, ''), url: m[2] ?? '' });
      continue;
    }
    // byline such as "Nov 26, 2026 · @Maxi"
    if (/\s·\s@\S+$/.test(line)) {
      blocks.push(`<p class="dash-story__byline">${inline(line)}</p>`);
      continue;
    }
    // verdict pill before "**Urteil: ...**"
    if (/^\*\*Urteil:/.test(line) && urteile[verdict]) {
      const label = urteile[verdict++];
      blocks.push(`<p class="dash-story__verdict"><span class="verdict verdict--${VERDICT_CLASS[label.toLowerCase()] ?? 'mythos'}">${esc(label)}</span></p>`);
    }
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    const img = line.replace(/\\/g, '').match(/^(?:&#91;|\[)image:\s*(.*)\]$/i);
    if (img) {
      // the article's picture placeholder: the drawing from dashboard.json (illustration), else the description
      const src = safeUrl(illustration);
      blocks.push(
        src
          ? `<figure class="dash-story__figure dash-story__figure--img"><img src="${esc(src)}" alt="${esc(img[1])}" loading="lazy" decoding="async" /></figure>`
          : `<figure class="dash-story__figure"><figcaption>${esc(img[1])}</figcaption></figure>`,
      );
      continue;
    }
    const isNote = /^\*[^*].*\*$/.test(line);
    if (!teaser && !isNote) teaser = line.replace(/\s*\\\[\d+\\\]/g, '');
    blocks.push(`<p${isNote ? ' class="dash-story__note"' : ''}>${inline(line)}</p>`);
  }
  flush();
  return { title, teaser, html: blocks.join(''), sources };
}

// ---------- ticker (in the header band) ----------
export function renderTicker(root: HTMLElement): void {
  const list = (Array.isArray(data.ticker) ? data.ticker : []).filter((i) => text(i?.text) && safeUrl(i?.url));
  root.hidden = !list.length;
  if (!list.length) return void (root.innerHTML = '');
  const one = list
    .map(
      (i) =>
        `<li><a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer">${esc(text(i.text))}${text(i.source) ? `<span class="ticker__src">${esc(text(i.source))}</span>` : ''}</a></li>`,
    )
    .join('');
  // the list twice in a row makes the loop seamless; the copy is hidden from screen readers
  root.innerHTML = `<div class="ticker"><span class="ticker__label">Neu</span><div class="ticker__view" aria-label="Neuigkeiten"><div class="ticker__track"><ul>${one}</ul><ul aria-hidden="true">${one.replace(/<a /g, '<a tabindex="-1" ')}</ul></div></div></div>`;
  const track = root.querySelector<HTMLElement>('.ticker__track')!;
  // about 35 px per second, whatever the length of the items
  requestAnimationFrame(() => track.style.setProperty('--ticker-time', `${Math.max(40, Math.round(track.scrollWidth / 2 / 35))}s`));
}

// ---------- hero background: dithered dot cloud on cream ----------
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const SHADES = ['#D6E5F6', '#9FC2EA', '#5C9BDD', '#0066CC'];

/** Draws once (static). Ordered dithering of a soft cloud, denser to the right, as round dots. */
export function drawDither(canvas: HTMLCanvasElement): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const phone = w < 720;
  const step = phone ? 8 : 7;
  const scale = phone ? 150 : 230;
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const nx = x / scale;
      const ny = y / scale;
      let v = 0.55 * noise(nx, ny) + 0.28 * noise(nx * 2.1 + 7, ny * 2.1 + 3) + 0.17 * noise(nx * 4.3 + 11, ny * 4.3 + 5);
      // a cloud bank on the right, thinning out to the left where the text is
      v = v * (0.35 + 0.85 * Math.pow(x / w, 1.3)) - (phone ? 0.12 : 0.05);
      const t = BAYER[(((y / step) | 0) % 4) * 4 + (((x / step) | 0) % 4)];
      if (v <= t) continue;
      const k = Math.min(1, (v - t) * 2.2 + v * 0.4);
      ctx.fillStyle = SHADES[Math.min(3, Math.floor(k * 4))];
      ctx.beginPath();
      ctx.arc(x, y, step * (0.16 + 0.2 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- rendering ----------
function storyCard(side: 'left' | 'right', label: string, title: string, teaser: string, key: string, image: string, index = 0): string {
  const img = safeUrl(image);
  return `<button type="button" class="dash-story dash-story--${side}" data-story="${key}" aria-haspopup="dialog" style="--i:${index}">
    ${img ? `<span class="dash-story__media" aria-hidden="true"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" /></span>` : ''}
    <span class="dash-story__body">
      <span class="dash-story__label">${esc(label)}</span>
      <span class="dash-story__title">${esc(title)}</span>
      ${teaser ? `<span class="dash-story__teaser">${esc(teaser)}</span>` : ''}
      <span class="dash-story__more">Weiterlesen</span>
    </span>
  </button>`;
}

let resizeHandler: (() => void) | null = null;

/** details that open and close with a short height animation (instant with reduced motion) */
function smoothDetails(d: HTMLDetailsElement) {
  const summary = d.querySelector('summary')!;
  const body = d.querySelector<HTMLElement>('.dash-sources__body');
  if (!body) return;
  let anim: Animation | null = null;
  summary.addEventListener('click', (e) => {
    // the arrow follows the state at once, also while closing
    if (reduceMotion()) return void d.classList.toggle('is-open', !d.open);
    e.preventDefault();
    anim?.cancel();
    const opening = !d.open;
    if (opening) d.open = true;
    d.classList.toggle('is-open', opening);
    const h = body.scrollHeight;
    anim = body.animate(
      [
        { height: opening ? '0px' : `${h}px`, opacity: opening ? 0 : 1 },
        { height: opening ? `${h}px` : '0px', opacity: opening ? 1 : 0 },
      ],
      { duration: 260, easing: 'ease-out' },
    );
    anim.onfinish = () => {
      if (!opening) d.open = false;
      anim = null;
    };
  });
}

// ---------- parallax: the dot cloud follows the mouse a little (max 12 px, eased) ----------
const PARALLAX = 12;
let parallaxTarget: HTMLCanvasElement | null = null;
let px = 0;
let py = 0;
let tx = 0;
let ty = 0;
let frame = 0;
function tick() {
  frame = 0;
  if (!parallaxTarget?.isConnected) return;
  px += (tx - px) * 0.08;
  py += (ty - py) * 0.08;
  parallaxTarget.style.setProperty('--px', `${px.toFixed(2)}px`);
  parallaxTarget.style.setProperty('--py', `${py.toFixed(2)}px`);
  if (Math.abs(tx - px) > 0.05 || Math.abs(ty - py) > 0.05) frame = requestAnimationFrame(tick);
}
function onPointer(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || reduceMotion() || !parallaxTarget?.isConnected || parallaxTarget.closest('[hidden]')) return;
  tx = -((e.clientX / window.innerWidth) * 2 - 1) * PARALLAX;
  ty = -((e.clientY / window.innerHeight) * 2 - 1) * PARALLAX;
  if (!frame) frame = requestAnimationFrame(tick);
}
function startParallax(canvas: HTMLCanvasElement) {
  if (!parallaxTarget) window.addEventListener('pointermove', onPointer, { passive: true });
  parallaxTarget = canvas;
  canvas.style.setProperty('--px', `${px}px`);
  canvas.style.setProperty('--py', `${py}px`);
}

export function renderDashboard(root: HTMLElement, ctx: DashboardContext): void {
  const felder = ctx.felder.map((f) => FIELD_LABEL[f] ?? '').filter(Boolean);

  // stories: only parts with content are shown
  const day = text(data.dayInLife?.markdown) ? storyParts(data.dayInLife!.markdown!, text(data.dayInLife?.illustration)) : null;
  const news = data.bigNews && text(data.bigNews.title) ? data.bigNews : null;
  const dayLabel = text(data.dayInLife?.label) || 'Ein Tag im Leben';
  const newsLabel = text(news?.label) || 'Große Neuigkeit';
  const articles = (Array.isArray(data.artikel) ? data.artikel : [])
    .filter((a) => text(a?.markdown))
    .map((a) => ({ a, parts: storyParts(a.markdown!, text(a.illustration), Array.isArray(a.urteile) ? a.urteile : []), label: text(a.label) }))
    .filter((x) => x.parts.title);
  const stripLabel = (title: string, label: string) => (label && title.toLowerCase().startsWith(`${label.toLowerCase()}:`) ? title.slice(label.length + 1).trim() : title);
  const items = [
    day && day.title ? { key: 'day', label: dayLabel, title: day.title.replace(/^Ein Tag im Leben:\s*/i, ''), teaser: day.teaser, image: text(data.dayInLife?.image) } : null,
    news ? { key: 'news', label: newsLabel, title: text(news.title), teaser: text(news.teaser), image: text(news.image) } : null,
    ...articles.map((x, i) => ({ key: `art-${i}`, label: x.label || 'Artikel', title: stripLabel(x.parts.title, x.label), teaser: x.parts.teaser, image: text(x.a.image) })),
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));
  const cards = items.map((c, i) => storyCard(i % 2 ? 'right' : 'left', c.label, c.title, c.teaser, c.key, c.image, i));

  const deadlines = myDeadlines(ctx.saved);
  const rows = deadlines
    .map(({ offer: o, days }, i) => {
      const link = safeUrl(o.link);
      const [y, m, d] = isIso(o.frist) ? o.frist.split('-').map(Number) : [0, 0, 0];
      return `<li class="frist${days !== null && days < 0 ? ' is-past' : ''}" style="--i:${i}">
        <div class="frist__date" aria-hidden="true">${days === null ? '<span class="frist__none">Ohne Frist</span>' : `<span class="frist__day">${d}</span><span class="frist__month">${MONTHS[m - 1]} ${y}</span>`}</div>
        <div class="frist__what">
          <p class="frist__title">${esc(o.name)}</p>
          <p class="frist__meta">${esc(TYP_LABEL[o.typ] ?? o.typ)}${days !== null ? `, Frist ${esc(formatDate(o.frist))}` : ''}. Zuletzt geprüft am ${esc(formatDate(o.zuletzt_geprueft))}</p>
        </div>
        ${days !== null ? `<span class="pill${days < 0 ? ' pill--past' : ''}">${daysLabel(days)}</span>` : '<span class="pill pill--quiet">Frist offen</span>'}
        <div class="frist__actions">
          ${link ? `<a class="qbtn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Offizielle Seite</a>` : ''}
          <button type="button" class="qbtn qbtn--muted" data-unsave="${esc(o.id)}" aria-label="${esc(o.name)} aus Meine Fristen entfernen">Entfernen</button>
        </div>
      </li>`;
    })
    .join('');

  root.innerHTML = `
    <section class="hero">
      <div class="hero__bg" aria-hidden="true"><canvas class="hero__dots"></canvas></div>
      <div class="hero__in">
        <h1 class="hero__title">${esc(greetingLine(ctx.name))}</h1>
        ${felder.length ? `<p class="hero__fields">Deine Interessen: ${esc(felder.join(', '))}</p>` : ''}
        <form class="ask" data-ask>
          <label class="sr-only" for="ask-input">Frage an Pathfinder</label>
          <input id="ask-input" class="ask__input" name="q" type="text" autocomplete="off" maxlength="500" placeholder="Frag Pathfinder etwas ..." />
          <button class="ask__send" type="submit" aria-label="Frage senden"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
        </form>
        <div class="hero__row">
          <div class="hero__chips" role="group" aria-label="Vorschläge">${SUGGESTIONS.map((q) => `<button type="button" class="chip-s" data-ask-chip>${esc(q)}</button>`).join('')}</div>
          <button type="button" class="qbtn qbtn--strong" data-dash="mentor">Mentor kontaktieren</button>
        </div>
      </div>
    </section>
    ${cards.length ? `<section class="dash-sec" aria-labelledby="stories-title"><h2 class="dash-sec__title" id="stories-title">Zum Lesen</h2><div class="dash-stories${cards.length > 2 ? ' dash-stories--3' : ''}">${cards.join('')}</div></section>` : ''}
    <section class="dash-sec" id="fristen" aria-labelledby="fristen-title" tabindex="-1">
      <div class="dash-sec__head"><h2 class="dash-sec__title" id="fristen-title">Meine Fristen</h2>${deadlines.length ? `<span class="count" aria-label="${deadlines.length} gespeichert">${deadlines.length}</span>` : ''}</div>
      ${
        deadlines.length
          ? `<ol class="fristen">${rows}</ol>`
          : `<div class="fristen-empty"><p class="fristen-empty__title">Noch keine Fristen gespeichert.</p><p>Frag den KI-Assistenten nach Wettbewerben, Sommerkursen oder Hochschulen und tippe bei einer Empfehlung auf "Zu Meine Fristen hinzufügen".</p><button type="button" class="qbtn qbtn--strong" data-ask-empty>Zum KI-Assistenten</button></div>`
      }
    </section>
    <dialog class="dash-modal" data-dash-modal aria-labelledby="dash-modal-title"></dialog>`;

  // hero background, drawn once and again after a real resize
  const canvas = root.querySelector<HTMLCanvasElement>('.hero__dots')!;
  requestAnimationFrame(() => drawDither(canvas));
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  let lastW = window.innerWidth;
  let timer = 0;
  resizeHandler = () => {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => drawDither(canvas), 200);
  };
  window.addEventListener('resize', resizeHandler);
  startParallax(canvas);

  const form = root.querySelector<HTMLFormElement>('[data-ask]')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.ask(String(new FormData(form).get('q') ?? '').trim());
  });
  root.querySelectorAll<HTMLButtonElement>('[data-ask-chip]').forEach((b) => b.addEventListener('click', () => ctx.ask(b.textContent!.trim())));
  root.querySelector<HTMLButtonElement>('[data-ask-empty]')?.addEventListener('click', () => ctx.ask());
  root.querySelector<HTMLButtonElement>('[data-dash="mentor"]')?.addEventListener('click', () => ctx.openMentor());
  root.querySelectorAll<HTMLButtonElement>('[data-unsave]').forEach((b) =>
    b.addEventListener('click', () => {
      ctx.unsave(b.dataset.unsave!);
      const y = window.scrollY;
      renderDashboard(root, { ...ctx, saved: ctx.saved.filter((x) => x !== b.dataset.unsave) });
      window.scrollTo(0, y);
      root.querySelector<HTMLElement>('#fristen')?.focus({ preventScroll: true });
    }),
  );

  // full story in a dialog, it grows out of the card
  const modal = root.querySelector<HTMLDialogElement>('[data-dash-modal]')!;
  const sourcesBlock = (items: { label: string; url: string; note?: string }[]) =>
    items.length
      ? `<details class="dash-sources"><summary><span>Quellen anzeigen</span><svg class="dash-sources__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></summary><div class="dash-sources__body"><ol>${items
          .map((s) => `<li>${safeUrl(s.url) ? `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>` : esc(s.label)}${s.note ? `, ${esc(s.note)}` : ''}</li>`)
          .join('')}</ol></div></details>`
      : '';
  const openStory = (key: string, from: HTMLElement) => {
    let body = '';
    if (key === 'day' && day) {
      body = `<p class="dash-modal__label">${esc(dayLabel)}</p>
        <h2 id="dash-modal-title">${esc(day.title.replace(/^Ein Tag im Leben:\s*/i, ''))}</h2>
        <div class="dash-modal__text">${day.html}</div>
        ${sourcesBlock(day.sources)}`;
    } else if (key === 'news' && news) {
      body = `<p class="dash-modal__label">${esc(newsLabel)}</p>
        <h2 id="dash-modal-title">${esc(text(news.title))}</h2>
        <div class="dash-modal__text">${text(news.body)
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((p) => `<p>${esc(p.trim())}</p>`)
          .join('')}</div>
        ${sourcesBlock(text(news.source) || safeUrl(news.url) ? [{ label: text(news.source) || safeUrl(news.url), url: safeUrl(news.url), note: isIso(news.verified) ? `geprüft am ${formatDate(news.verified)}` : '' }] : [])}`;
    }
    const art = key.startsWith('art-') ? articles[Number(key.slice(4))] : undefined;
    if (art) {
      body = `<p class="dash-modal__label">${esc(art.label || 'Artikel')}</p>
        <h2 id="dash-modal-title">${esc(stripLabel(art.parts.title, art.label))}</h2>
        <div class="dash-modal__text">${art.parts.html}</div>
        ${sourcesBlock(art.parts.sources)}`;
    }
    if (!body) return;
    modal.innerHTML = `<div class="dash-modal__inner">${body}</div><button type="button" class="dash-modal__close" data-dash-close>Schließen</button>`;
    const r = from.getBoundingClientRect();
    modal.style.setProperty('--from-x', `${r.left + r.width / 2 - window.innerWidth / 2}px`);
    modal.style.setProperty('--from-y', `${r.top + r.height / 2 - window.innerHeight / 2}px`);
    modal.showModal();
    modal.scrollTop = 0;
    modal.querySelectorAll<HTMLDetailsElement>('.dash-sources').forEach(smoothDetails);
    modal.querySelector<HTMLButtonElement>('[data-dash-close]')!.addEventListener('click', () => close());
  };
  const close = () => {
    if (reduceMotion()) return modal.close();
    modal.classList.add('is-closing');
    window.setTimeout(() => {
      modal.classList.remove('is-closing');
      modal.close();
    }, 220);
  };
  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // a click on the dark backdrop closes it
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-story]').forEach((b) => b.addEventListener('click', () => openStory(b.dataset.story!, b)));
}
