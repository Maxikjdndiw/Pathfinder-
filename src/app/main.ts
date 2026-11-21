/**
 * /app: the Pathfinder DE coach. Login with an access code, one chat in three modes,
 * recommendation cards from the verified offers list, mentor request via Netlify Forms.
 * Profile, history and saved offers stay in this browser (localStorage).
 */
import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '../styles/tokens.css';
import '../styles/base.css';
import './app.css';
import { parseMarkers, visibleText, type ModeButton, type Recommendation } from './markers';
import { createSlideConfirm, type SlideResult } from './slide-confirm';
import { createCodeSlots } from './code-slots';
import { createLatticeLoader } from '../components/lattice-loader';
import {
  COST_LABELS as PILL_LABELS,
  COST_STEPS,
  defaultFilters,
  FIELD_LABEL,
  filterOffers,
  formatDate,
  formatEuro,
  isPast,
  OFFERS,
  STUFE_LABEL,
  TYP_LABEL,
  type Filters,
  type Offer,
  type Stufe,
  type Typ,
} from './offers';

type Mode = ModeButton['mode'];
/** a file attached to a message (stored on the server, see netlify/functions/upload.mts) */
interface FileRef {
  id: string;
  name: string;
  type?: string;
  size?: number;
  /** deleted by the student */
  geloescht?: boolean;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  dateien?: FileRef[];
  /** technical messages (start of a mode) are sent but not shown */
  hidden?: boolean;
}
interface State {
  mode: Mode;
  profile: Record<string, unknown>;
  messages: Msg[];
  saved: string[];
  /** a mentor request was sent from this browser */
  mentorSent?: boolean;
  /** the request created a direct chat with the mentor (false: it went out as a backup form only) */
  mentorThread?: boolean;
  /** time of the newest mentor message the student has seen */
  mentorSeen?: string;
}

const MENTOR = '[[SYSTEM: MENTOR_ANFRAGE]]';
const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- storage (this browser only) ----------
const CODE_KEY = 'pf-app:code';
let code = '';
let state: State = { mode: 'orientierung', profile: {}, messages: [], saved: [] };
const storeKey = () => `pf-app:${code}`;
function load() {
  try {
    const raw = localStorage.getItem(storeKey());
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch {
    /* private mode or broken data: start fresh */
  }
}
function save() {
  try {
    localStorage.setItem(storeKey(), JSON.stringify({ ...state, messages: state.messages.slice(-60) }));
  } catch {
    /* storage full or blocked: the chat still works for this visit */
  }
}

// ---------- screens ----------
type Screen = 'login' | 'register' | 'chat' | 'vorlagen';
function show(screen: Screen) {
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => (el.hidden = el.dataset.screen !== screen));
  document.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => (el.hidden = el.dataset.when !== screen));
  if (screen === 'login' || screen === 'register') history.replaceState(null, '', screen === 'register' ? '#zugang' : location.pathname);
}

const log = $<HTMLElement>('[data-log]');
const input = $<HTMLTextAreaElement>('#chat-input');
const chatForm = $<HTMLFormElement>('[data-form="chat"]');
let busy = false;
/** which conversation the composer writes to */
let view: 'coach' | 'mentor' = 'coach';

function setMode(mode: Mode) {
  state.mode = mode;
  document.querySelectorAll<HTMLElement>('[data-step]').forEach((li) => {
    li.classList.toggle('is-current', li.dataset.step === mode);
    if (li.dataset.step === mode) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  updateMentorSlot();
}

/** The mentor slider belongs to the CV and internship parts, not to orientation. */
function updateMentorSlot() {
  const slot = $<HTMLElement>('[data-mentor-slot]');
  slot.hidden = view === 'mentor' || state.mode === 'orientierung' || !state.messages.some((m) => m.role === 'assistant');
}

// ---------- rendering of messages ----------
/** Small, safe formatting: paragraphs, lists, code blocks for CV templates, **bold**. */
function format(text: string): string {
  const parts = text.split(/```[a-z]*\n?/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return `<pre class="msg__pre">${esc(part.trim())}</pre>`;
      return part
        .trim()
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((block) => {
          const lines = block.split('\n');
          const inline = (l: string) => esc(l).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
          if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
            const ordered = /^\s*\d+\./.test(lines[0]);
            const items = lines.map((l) => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('');
            return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
          }
          return `<p>${lines.map(inline).join('<br>')}</p>`;
        })
        .join('');
    })
    .join('');
}

/** chips for attached files: open with a click, delete with the cross (own files only) */
function fileChips(files: FileRef[] | undefined, own: boolean): string {
  if (!files?.length) return '';
  return `<ul class="files">${files
    .map((f) =>
      f.geloescht
        ? `<li class="file is-gone"><span class="file__name">${esc(f.name)}</span><span class="file__state">gelöscht</span></li>`
        : `<li class="file"><button type="button" class="file__name" data-open-file="${esc(f.id)}" data-name="${esc(f.name)}">${esc(f.name)}</button>${
            own ? `<button type="button" class="file__del" data-del-file="${esc(f.id)}" aria-label="${esc(f.name)} löschen">×</button>` : ''
          }</li>`,
    )
    .join('')}</ul>`;
}

function bubble(role: Msg['role'], html: string, files?: FileRef[]): HTMLElement {
  const el = document.createElement('div');
  el.className = `msg msg--${role === 'user' ? 'me' : 'coach'}`;
  el.innerHTML = `${fileChips(files, role === 'user')}${html ? `<div class="msg__body">${html}</div>` : ''}`;
  if (role !== 'user' && !html) el.innerHTML = '<div class="msg__body"></div>';
  log.appendChild(el);
  return el;
}

function renderAll() {
  log.innerHTML = '';
  const lastAssistant = state.messages.map((m) => m.role).lastIndexOf('assistant');
  state.messages.forEach((m, i) => {
    if (m.hidden) return;
    if (m.role === 'user') return void bubble('user', m.dateien?.length && m.content === FILE_ONLY ? '' : format(m.content), m.dateien);
    const parsed = parseMarkers(m.content);
    const el = bubble('assistant', format(parsed.text));
    if (parsed.recommendation) renderRecommendations(el, parsed.recommendation);
    if (i === lastAssistant) renderActions(el, parsed.options, parsed.buttons);
  });
  scrollDown();
}

/* ---------- scrolling: follow new text only while the reader is at the bottom ----------
   One scroll per frame at most. Scrolling up stops the following; it starts again at the
   bottom or with the "Nach unten" button. */
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toBottom = $<HTMLButtonElement>('[data-to-bottom]');
const pageEnd = () => document.documentElement.scrollHeight;
const atBottom = () => window.innerHeight + window.scrollY >= pageEnd() - 96;
let follow = true;
let scrollQueued = false;
window.addEventListener(
  'scroll',
  () => {
    follow = atBottom();
    toBottom.hidden = follow;
  },
  { passive: true },
);
function scrollDown(force = false) {
  if (force) follow = true;
  if (!follow || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    if (follow) window.scrollTo({ top: pageEnd(), behavior: 'auto' });
    toBottom.hidden = true;
  });
}
toBottom.addEventListener('click', () => {
  follow = true;
  toBottom.hidden = true;
  window.scrollTo({ top: pageEnd(), behavior: reduceMotion() ? 'auto' : 'smooth' });
});

/* ---------- paced writing: small pieces in a steady beat instead of uneven bursts ---------- */
function typer(render: (text: string) => void) {
  let full = '';
  let shown = 0;
  let ended = false;
  let done: (() => void) | null = null;
  const timer = window.setInterval(() => {
    const backlog = full.length - shown;
    if (backlog > 0) {
      // 2 characters per beat at least; a long backlog goes a little faster so it never lags far behind
      let next = shown + Math.min(backlog, Math.max(2, Math.ceil(backlog / 48)));
      // end the piece at a word boundary when one is close
      const space = full.indexOf(' ', next);
      if (space > 0 && space - next < 6) next = space;
      shown = Math.min(next, full.length);
      render(full.slice(0, shown));
      scrollDown();
    }
    if (ended && shown >= full.length) {
      window.clearInterval(timer);
      done?.();
    }
  }, 33);
  return {
    push(text: string) {
      full = text;
    },
    finish() {
      ended = true;
      return new Promise<void>((r) => (done = r));
    },
    stop() {
      window.clearInterval(timer);
    },
  };
}

/** Tappable options (several can be picked) and mode buttons, only under the latest reply. */
function renderActions(after: HTMLElement, options: string[], buttons: ModeButton[]) {
  if (!options.length && !buttons.length) return;
  const box = document.createElement('div');
  box.className = 'actions';
  if (options.length) {
    const check = '<span class="opt__check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.4 12.5 5"/></svg></span>';
    box.innerHTML = `<div class="opts" role="group" aria-label="Auswahl, mehrere möglich">${options
      .map((o) => `<button type="button" class="opt chip" aria-pressed="false" data-option="${esc(o)}">${check}<span>${esc(o)}</span></button>`)
      .join('')}</div><button type="button" class="btn btn--solid btn--small" data-send-options disabled>Weiter</button>`;
    const sendBtn = box.querySelector<HTMLButtonElement>('[data-send-options]')!;
    box.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        const on = chip.getAttribute('aria-pressed') !== 'true';
        // "Keins davon" stands alone
        if (on && /^keins davon/i.test(chip.dataset.option!)) box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        if (on && !/^keins davon/i.test(chip.dataset.option!)) box.querySelectorAll<HTMLElement>('.chip').forEach((c) => /^keins davon/i.test(c.dataset.option!) && c.setAttribute('aria-pressed', 'false'));
        chip.setAttribute('aria-pressed', String(on));
        sendBtn.disabled = !box.querySelector('.chip[aria-pressed="true"]');
      }),
    );
    sendBtn.addEventListener('click', () => {
      const picked = [...box.querySelectorAll<HTMLElement>('.chip[aria-pressed="true"]')].map((c) => c.dataset.option!);
      if (picked.length) send(picked.length === 1 && /^keins davon/i.test(picked[0]) ? picked[0] : `Ich wähle: ${picked.join(', ')}`);
    });
  }
  if (buttons.length) {
    const row = document.createElement('div');
    row.className = 'mode-buttons';
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--quiet btn--small';
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        setMode(b.mode);
        send(b.label);
      });
      row.appendChild(btn);
    });
    box.appendChild(row);
  }
  after.appendChild(box);
}

// ---------- recommendation cards ----------
const COST_LABELS = COST_STEPS.map((v, i) => (i === COST_STEPS.length - 1 ? `${formatEuro(v)} oder mehr` : formatEuro(v)));
let recCount = 0;

function renderRecommendations(after: HTMLElement, rec: Recommendation) {
  const id = `rec-${++recCount}`;
  const stufe = (rec.stufe ?? (state.profile.stufe as Stufe | undefined) ?? null) as Stufe | null;
  const f: Filters = defaultFilters(rec.felder, stufe);
  const fieldsAvailable = [...new Set([...rec.felder, ...OFFERS.flatMap((o) => o.felder)])].filter((x) => FIELD_LABEL[x]);
  const box = document.createElement('section');
  box.className = 'recs';
  box.setAttribute('aria-labelledby', `${id}-title`);
  box.innerHTML = `
    <h3 class="recs__title" id="${id}-title">Angebote für dich</h3>
    <p class="recs__note">Fristen und Kosten immer beim Anbieter prüfen.</p>
    <details class="recs__filters">
      <summary>Filter</summary>
      <div class="filter-grid">
        <label class="field"><span class="field__label">Land</span>
          <select class="input" data-f="land"><option value="alle">Alle</option><option value="de">Deutschland</option><option value="ausland">Ausland</option><option value="online">Online</option></select></label>
        <label class="field"><span class="field__label">Stufe</span>
          <select class="input" data-f="stufe"><option value="alle">Alle</option>${(Object.keys(STUFE_LABEL) as Stufe[]).map((s) => `<option value="${s}">${STUFE_LABEL[s]}</option>`).join('')}</select></label>
        <label class="field"><span class="field__label">Sortierung</span>
          <select class="input" data-f="sort"><option value="passung">Passung</option><option value="frist">Frist</option><option value="kosten">Kosten</option></select></label>
        <div class="field field--wide"><span class="field__label" id="${id}-cost">Kosten pro Jahr: <output data-cost-out></output></span>
          <div class="range2" role="group" aria-labelledby="${id}-cost">
            <input type="range" min="0" max="${COST_STEPS.length - 1}" step="1" data-f="kostenMin" aria-label="Kosten mindestens" />
            <input type="range" min="0" max="${COST_STEPS.length - 1}" step="1" data-f="kostenMax" aria-label="Kosten höchstens" />
          </div>
          <div class="chips chips--small">
            <button type="button" class="chip" data-cost="0,0">Kostenlos oder nur Semesterbeitrag</button>
            <button type="button" class="chip" data-cost="0,1">bis 1.000 €</button>
            <button type="button" class="chip" data-cost="5,6">über 30.000 €</button>
          </div>
        </div>
        <div class="field field--wide"><span class="field__label">Typ</span>
          <div class="chips chips--small" data-typen>${(Object.keys(TYP_LABEL) as Typ[]).map((t) => `<button type="button" class="chip" aria-pressed="false" data-typ="${t}">${TYP_LABEL[t]}</button>`).join('')}</div></div>
        <div class="field field--wide"><span class="field__label">Felder</span>
          <div class="chips chips--small" data-felder>${fieldsAvailable.map((x) => `<button type="button" class="chip" aria-pressed="${rec.felder.includes(x)}" data-feld="${x}">${esc(FIELD_LABEL[x])}</button>`).join('')}</div></div>
      </div>
    </details>
    <p class="recs__count" data-count aria-live="polite"></p>
    <div class="cards" data-cards></div>`;
  after.appendChild(box);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    f[k] = v;
    update();
  };
  const sel = (k: string) => box.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-f="${k}"]`)!;
  sel('land').value = f.land;
  sel('stufe').value = f.stufe;
  sel('sort').value = f.sort;
  sel('land').addEventListener('change', (e) => set('land', (e.target as HTMLSelectElement).value as Filters['land']));
  sel('stufe').addEventListener('change', (e) => set('stufe', (e.target as HTMLSelectElement).value as Filters['stufe']));
  sel('sort').addEventListener('change', (e) => set('sort', (e.target as HTMLSelectElement).value as Filters['sort']));
  const minEl = sel('kostenMin');
  const maxEl = sel('kostenMax');
  minEl.value = String(f.kostenMin);
  maxEl.value = String(f.kostenMax);
  minEl.addEventListener('input', () => {
    f.kostenMin = Math.min(Number(minEl.value), f.kostenMax);
    minEl.value = String(f.kostenMin);
    update();
  });
  maxEl.addEventListener('input', () => {
    f.kostenMax = Math.max(Number(maxEl.value), f.kostenMin);
    maxEl.value = String(f.kostenMax);
    update();
  });
  box.querySelectorAll<HTMLElement>('[data-cost]').forEach((b) =>
    b.addEventListener('click', () => {
      const [a, c] = b.dataset.cost!.split(',').map(Number);
      f.kostenMin = a;
      f.kostenMax = c;
      minEl.value = String(a);
      maxEl.value = String(c);
      update();
    }),
  );
  const toggleGroup = (attr: string, key: 'typen' | 'felder') =>
    box.querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((b) =>
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        const v = b.dataset[attr]!;
        const list = new Set<string>(f[key]);
        if (on) list.add(v);
        else list.delete(v);
        (f[key] as string[]) = [...list];
        update();
      }),
    );
  toggleGroup('typ', 'typen');
  toggleGroup('feld', 'felder');

  function update() {
    box.querySelector('[data-cost-out]')!.textContent = `${COST_LABELS[f.kostenMin]} bis ${COST_LABELS[f.kostenMax]}`;
    const list = filterOffers(OFFERS, f);
    const known = rec.felder.filter((x) => OFFERS.some((o) => o.felder.includes(x)));
    box.querySelector('[data-count]')!.textContent = list.length
      ? `${list.length} ${list.length === 1 ? 'Angebot' : 'Angebote'}`
      : known.length
        ? 'Keine Treffer.'
        : 'Noch keine geprüften Angebote für diese Felder.';
    box.querySelector('[data-cards]')!.innerHTML = list.map(card).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) =>
      b.addEventListener('click', () => {
        const oid = b.dataset.save!;
        state.saved = state.saved.includes(oid) ? state.saved.filter((x) => x !== oid) : [...state.saved, oid];
        save();
        document.querySelectorAll<HTMLButtonElement>(`[data-save="${oid}"]`).forEach((x) => x.setAttribute('aria-pressed', String(state.saved.includes(oid))));
      }),
    );
  }
  update();
}

function card(o: Offer): string {
  const study = o.typ === 'hochschule' || o.typ === 'studiengang';
  const cost =
    o.kosten_pro_jahr_eur === null
      ? o.kosten_hinweis ? 'Siehe Hinweis' : 'Kosten unbekannt'
      : o.kosten_pro_jahr_eur === 0
        ? study ? 'Nur Semesterbeitrag' : 'Kostenlos'
        : `${formatEuro(o.kosten_pro_jahr_eur)} pro Jahr`;
  const place = [o.ort, o.online ? 'online' : ''].filter(Boolean).join(', ');
  const past = isPast(o.frist);
  const frist = o.frist ? `${formatDate(o.frist)}${past ? ' (abgelaufen)' : ''}` : 'noch nicht bekannt';
  const saved = state.saved.includes(o.id);
  return `<article class="offer">
    <div class="offer__top">
      <span class="offer__typ">${TYP_LABEL[o.typ] ?? esc(o.typ)}</span>
      ${o.kosten_label && PILL_LABELS.includes(o.kosten_label) ? `<span class="offer__label offer__label--${esc(o.kosten_label.replace(/\s+/g, '-'))}">${esc(o.kosten_label)}</span>` : ''}
      ${o.sprache === 'en' ? '<span class="offer__lang">Englisch</span>' : ''}
      <button type="button" class="offer__save" data-save="${o.id}" aria-pressed="${saved}" aria-label="Merken: ${esc(o.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.9 1.4-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg></button>
    </div>
    <h4 class="offer__name">${esc(o.name)}</h4>
    <p class="offer__by">${esc(o.anbieter)}</p>
    <dl class="offer__meta">
      ${place ? `<div><dt>Ort</dt><dd>${esc(place)}</dd></div>` : ''}
      <div><dt>Kosten</dt><dd>${esc(cost)}</dd></div>
      <div><dt>Frist</dt><dd class="${past ? 'is-past' : ''}">${esc(frist)}</dd></div>
    </dl>
    <p class="offer__text">${esc(o.kurzbeschreibung)}</p>
    ${o.kosten_pro_jahr_eur === null && o.kosten_hinweis ? `<p class="offer__hint">${esc(o.kosten_hinweis)}</p>` : ''}
    ${o.quelle_qualitaet === 'C' ? '<p class="offer__hint">Bitte auf der Karriereseite des Unternehmens prüfen.</p>' : ''}
    <div class="offer__foot">
      <span>Zuletzt geprüft am ${esc(formatDate(o.zuletzt_geprueft))}</span>
      <a class="btn btn--quiet btn--small" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">Mehr erfahren<span class="btn__arrow" aria-hidden="true">→</span></a>
    </div>
  </article>`;
}

// ---------- talking to the coach ----------
async function ask(messages: Msg[], onText: (raw: string) => void): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      mode: state.mode,
      profile: state.profile,
      messages: messages.map(({ role, content, dateien }) => ({ role, content, dateien: dateien?.filter((f) => !f.geloescht).map(({ id, name }) => ({ id, name })) })),
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) logout();
    throw new Error(err.error ?? 'Gerade klappt die Verbindung nicht.');
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let raw = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const lineText = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!lineText.trim()) continue;
      const ev = JSON.parse(lineText);
      if (ev.t) {
        raw += ev.t;
        onText(raw);
      } else if (ev.error) throw new Error(ev.error);
    }
  }
  return raw;
}

async function send(text: string, opts: { hidden?: boolean; dateien?: FileRef[] } = {}) {
  if (busy) return;
  busy = true;
  chatForm.classList.add('is-busy');
  log.querySelectorAll('.actions').forEach((a) => a.remove());
  state.messages.push({ role: 'user', content: text, hidden: opts.hidden, ...(opts.dateien?.length ? { dateien: opts.dateien } : {}) });
  if (!opts.hidden) bubble('user', opts.dateien?.length && text === FILE_ONLY ? '' : format(text), opts.dateien);
  const el = bubble('assistant', '');
  const body = el.querySelector<HTMLElement>('.msg__body')!;
  // LatticeLoader where the reply will appear; it stays above the text while it streams
  const loader = createLatticeLoader({
    label: 'Denkt nach',
    doneLabel: 'Fertig in',
    errorLabel: 'Fehlgeschlagen nach',
    pattern: 'orbit',
    grid: 3,
    shape: 'round',
    cellSize: 6,
    gap: 2,
    fontSize: 14,
    showTimer: true,
    color: '#0066CC',
    doneColor: '#22C55E',
    errorColor: '#C4321F',
  });
  const status = document.createElement('div');
  status.className = 'msg__status';
  status.append(loader.el);
  el.prepend(status);
  el.classList.add('is-streaming');
  scrollDown(true);
  const type = typer((t) => {
    const html = format(t);
    if (html) body.innerHTML = html;
  });
  try {
    const raw = await ask(state.messages, (r) => type.push(visibleText(r)));
    await type.finish();
    state.messages.push({ role: 'assistant', content: raw });
    const parsed = parseMarkers(raw);
    if (parsed.profile) state.profile = { ...state.profile, ...parsed.profile };
    if (parsed.recommendation) {
      state.profile.felder = [...new Set([...((state.profile.felder as string[]) ?? []), ...parsed.recommendation.felder])];
      if (parsed.recommendation.stufe) state.profile.stufe = parsed.recommendation.stufe;
    }
    save();
    body.innerHTML = format(parsed.text);
    el.classList.remove('is-streaming');
    loader.setStatus('done');
    // stays a moment, then folds away softly; older replies never show it again
    window.setTimeout(() => {
      status.classList.add('is-leaving');
      window.setTimeout(() => {
        loader.destroy();
        status.remove();
      }, 450);
    }, 1600);
    if (parsed.recommendation) renderRecommendations(el, parsed.recommendation);
    renderActions(el, parsed.options, parsed.buttons);
    updateMentorSlot();
  } catch (e) {
    type.stop();
    state.messages.pop(); // the student can send it again
    el.classList.remove('is-streaming');
    el.classList.add('msg--error');
    loader.setStatus('error');
    body.innerHTML = `<p>${esc((e as Error).message)}</p><button class="btn btn--quiet btn--small msg__retry" type="button">Erneut versuchen</button>`;
    body.querySelector('.msg__retry')!.addEventListener('click', () => {
      if (busy) return;
      loader.destroy();
      el.remove();
      // the student's message is still on screen: send it again without a second copy
      retry(text, opts);
    });
  } finally {
    busy = false;
    chatForm.classList.remove('is-busy');
    scrollDown();
  }
}

function retry(text: string, opts: { hidden?: boolean }) {
  const mine = log.querySelectorAll('.msg--me');
  if (!opts.hidden) mine[mine.length - 1]?.remove();
  send(text, opts);
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (tray.some((t) => t.state === 'laedt')) return void trayMessage('Einen Moment, die Datei wird noch hochgeladen.');
  const files = tray.filter((t) => t.state === 'fertig' && t.ref).map((t) => t.ref!);
  if (!text && !files.length) return;
  if (view === 'coach' && busy) return;
  input.value = '';
  autosize();
  clearTray(false);
  if (view === 'mentor') return void sendToMentor(text, files);
  showWelcome(false);
  send(text || FILE_ONLY, { dateien: files });
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});
const autosize = () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
};
input.addEventListener('input', autosize);

// ---------- mentor request ----------
/* Slide to confirm: the AI writes a short summary (marker protocol), the student can edit it,
   then it goes to /api/mentor-anfrage. That opens a direct chat with the mentor. If the
   function fails, the request goes to Netlify Forms instead, silently, as a backup. */
const dialog = $<HTMLDialogElement>('[data-mentor]');
const mentorForm = $<HTMLFormElement>('[data-form="mentor"]');
const mailToggle = $<HTMLInputElement>('[data-mentor-mail-toggle]');
const mailField = $<HTMLElement>('[data-mentor-mail]');
const MENTOR_ERROR = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
let mentorOutcome: { resolve(r: SlideResult): void; reject(e: Error): void } | null = null;
let mentorFailed = false;

mailToggle.addEventListener('change', () => {
  mailField.hidden = !mailToggle.checked;
  (mentorForm.elements.namedItem('email') as HTMLInputElement).required = mailToggle.checked;
});

const slider = createSlideConfirm({
  label: 'Zum Anfragen ziehen',
  pendingLabel: 'Einen Moment',
  doneLabel: 'Angefragt',
  errorText: MENTOR_ERROR,
  keyHint: 'Zum Bestätigen noch einmal drücken.',
  async onConfirm() {
    if (busy || state.mentorSent) return 'cancel';
    busy = true;
    let summary = '';
    try {
      const raw = await ask([...state.messages, { role: 'user', content: MENTOR }], () => {});
      summary = parseMarkers(raw).summary ?? visibleText(raw);
    } catch {
      summary = '';
    } finally {
      busy = false;
    }
    mentorForm.reset();
    mailField.hidden = true;
    (mentorForm.elements.namedItem('zusammenfassung') as HTMLTextAreaElement).value = summary;
    $<HTMLElement>('[data-mentor-error]').textContent = '';
    mentorFailed = false;
    dialog.showModal();
    return new Promise<SlideResult>((resolve, reject) => (mentorOutcome = { resolve, reject }));
  },
});
$<HTMLElement>('[data-mentor-slider]').append(slider.el);

dialog.addEventListener('close', () => {
  const outcome = mentorOutcome;
  mentorOutcome = null;
  if (!outcome) return;
  if (state.mentorSent) outcome.resolve('done');
  else if (mentorFailed) outcome.reject(new Error(MENTOR_ERROR));
  else outcome.resolve('cancel');
});
$<HTMLButtonElement>('[data-action="mentor-close"]').addEventListener('click', () => dialog.close());

/** backup only: the hidden Netlify form, used when the function cannot be reached */
async function mentorBackup(summary: string, email: string): Promise<boolean> {
  const body = new URLSearchParams({ 'form-name': 'mentor-anfrage', zugangscode: code, zusammenfassung: summary, email }).toString();
  try {
    const res = await fetch('/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    return res.ok;
  } catch {
    return false;
  }
}

let mentorSending = false;
mentorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (mentorSending || state.mentorSent) return;
  if (!mentorForm.reportValidity()) return;
  const summary = (mentorForm.elements.namedItem('zusammenfassung') as HTMLTextAreaElement).value.trim();
  const wantsMail = mailToggle.checked;
  const email = wantsMail ? (mentorForm.elements.namedItem('email') as HTMLInputElement).value.trim() : '';
  const submit = mentorForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const err = $<HTMLElement>('[data-mentor-error]');
  mentorSending = true;
  submit.disabled = true;
  err.textContent = '';
  try {
    let res: Response | null = null;
    try {
      res = await fetch('/api/mentor-anfrage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, zusammenfassung: summary, profil: state.profile, email, emailEinwilligung: wantsMail }),
      });
    } catch {
      res = null;
    }
    if (res && res.ok) {
      state.mentorSent = true;
      state.mentorThread = true;
      save();
      dialog.close();
      openMentorThread(true);
      return;
    }
    // a clear answer from the function (for example an invalid e-mail): show it
    if (res && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? MENTOR_ERROR);
    }
    // the function is down: the backup form still reaches the mentor
    if (!(await mentorBackup(summary, email))) throw new Error(MENTOR_ERROR);
    state.mentorSent = true;
    state.mentorThread = false;
    save();
    dialog.close();
  } catch (x) {
    mentorFailed = true;
    err.textContent = (x as Error).message || MENTOR_ERROR;
  } finally {
    mentorSending = false;
    submit.disabled = false;
  }
});

// ---------- direct chat with the mentor ----------
/* After a request, a second conversation opens next to the coach: only the student and the
   mentor write there. New mentor messages are fetched every 6 seconds. */
const views = $<HTMLElement>('[data-views]');
const mentorChat = $<HTMLElement>('[data-mentor-chat]');
const mentorLog = $<HTMLElement>('[data-mentor-log]');
const unreadDot = $<HTMLElement>('[data-mentor-unread]');
const chatSection = $<HTMLElement>('.chat');
const POLL_MS = 6000;
let pollTimer = 0;
let mentorMessages: { von: 'schueler' | 'mentor'; text: string; zeit: string; dateien?: FileRef[] }[] = [];

function setView(next: 'coach' | 'mentor') {
  if (next !== view) clearTray(true);
  view = next;
  views.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === next)));
  const mentor = next === 'mentor';
  chatSection.classList.toggle('is-mentor', mentor);
  mentorChat.hidden = !mentor;
  log.hidden = mentor;
  if (mentor) welcome.hidden = true;
  else showWelcome(!state.messages.some((m) => m.role === 'assistant'));
  updateMentorSlot();
  input.placeholder = mentor ? 'Nachricht an deinen Mentor' : 'Nachricht an Pathfinder';
  if (mentor) markMentorSeen();
  scrollDown(true);
}
views.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) =>
  b.addEventListener('click', () => setView(b.dataset.view as 'coach' | 'mentor')),
);

/* only new messages are added (and fade in); a full redraw would replay every fade */
let mentorRendered: typeof mentorMessages = [];
const mentorHtml = (m: (typeof mentorMessages)[number]) =>
  m.von === 'mentor'
    ? `<div class="msg msg--mentor"><p class="msg__who">Mentor</p>${fileChips(m.dateien, false)}${m.text ? `<div class="msg__body">${format(m.text)}</div>` : ''}</div>`
    : `<div class="msg msg--me">${fileChips(m.dateien, true)}${m.text ? `<div class="msg__body">${format(m.text)}</div>` : ''}</div>`;
function renderMentor() {
  const same = (a: (typeof mentorMessages)[number], b: (typeof mentorMessages)[number]) => a.von === b.von && a.text === b.text;
  const keeps = mentorRendered.length <= mentorMessages.length && mentorRendered.every((m, i) => same(m, mentorMessages[i]));
  if (keeps) {
    mentorLog.insertAdjacentHTML('beforeend', mentorMessages.slice(mentorRendered.length).map(mentorHtml).join(''));
  } else {
    mentorLog.innerHTML = mentorMessages.map(mentorHtml).join('');
    mentorLog.querySelectorAll('.msg').forEach((el) => el.classList.add('is-static'));
  }
  mentorRendered = [...mentorMessages];
}

function latestMentorTime() {
  return [...mentorMessages].reverse().find((m) => m.von === 'mentor')?.zeit ?? '';
}
function markMentorSeen() {
  const t = latestMentorTime();
  if (t && t !== state.mentorSeen) {
    state.mentorSeen = t;
    save();
  }
  unreadDot.hidden = true;
}

async function pollMentor() {
  if (!code || document.hidden) return;
  try {
    const res = await fetch('/api/mentor-nachrichten', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, aktion: 'holen' }),
    });
    if (!res.ok) return;
    const { thread } = await res.json();
    if (!thread) return;
    const before = mentorMessages.length;
    mentorMessages = thread.nachrichten;
    if (mentorMessages.length !== before) {
      renderMentor();
      if (view === 'mentor') {
        markMentorSeen();
        scrollDown();
      }
    }
    const newest = latestMentorTime();
    if (view !== 'mentor' && newest && newest !== state.mentorSeen) unreadDot.hidden = false;
  } catch {
    /* offline for a moment: the next poll tries again */
  }
}

function openMentorThread(switchTo: boolean) {
  views.hidden = false;
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(pollMentor, POLL_MS);
  pollMentor();
  if (switchTo) setView('mentor');
}
function closeMentorThread() {
  window.clearInterval(pollTimer);
  mentorMessages = [];
  mentorRendered = [];
  mentorLog.innerHTML = '';
  views.hidden = true;
  unreadDot.hidden = true;
  if (view === 'mentor') setView('coach');
}

async function sendToMentor(text: string, files: FileRef[] = []) {
  mentorLog.querySelectorAll('.msg--error').forEach((el) => el.remove());
  const pending = { von: 'schueler' as const, text, zeit: new Date().toISOString(), ...(files.length ? { dateien: files } : {}) };
  mentorMessages = [...mentorMessages, pending];
  renderMentor();
  scrollDown(true);
  try {
    const res = await fetch('/api/mentor-nachrichten', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, aktion: 'senden', text, dateien: files.map((f) => f.id) }),
    });
    if (!res.ok) throw new Error();
    mentorMessages = (await res.json()).thread.nachrichten;
    renderMentor();
  } catch {
    mentorMessages = mentorMessages.filter((m) => m !== pending);
    renderMentor();
    input.value = text;
    mentorLog.insertAdjacentHTML('beforeend', `<p class="msg msg--error"><span class="msg__body">${MENTOR_ERROR}</span></p>`);
  }
}

// ---------- request access ----------
const registerForm = $<HTMLFormElement>('[data-register-form]');
const registerDone = $<HTMLElement>('[data-register-done]');
let requestedCode = '';
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $<HTMLElement>('[data-register-error]');
  err.textContent = '';
  if (!registerForm.checkValidity()) {
    err.textContent = 'Bitte gib deinen Vornamen und deine E-Mail ein und bestätige den Datenschutzhinweis.';
    registerForm.reportValidity();
    return;
  }
  const f = registerForm.elements;
  const btn = registerForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  btn.disabled = true;
  try {
    const res = await fetch('/api/zugang', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vorname: (f.namedItem('vorname') as HTMLInputElement).value,
        email: (f.namedItem('email') as HTMLInputElement).value,
        datenschutz: (f.namedItem('datenschutz') as HTMLInputElement).checked,
        website: (f.namedItem('website') as HTMLInputElement).value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) throw new Error(data.error ?? 'Das hat nicht geklappt. Bitte versuche es noch einmal.');
    requestedCode = data.code;
    $<HTMLElement>('[data-register-code]').textContent = data.code;
    $<HTMLElement>('[data-register-note]').textContent = data.mail
      ? 'Wir haben ihn dir auch per E-Mail geschickt.'
      : 'Schreib ihn dir auf. Er ist dein Schlüssel.';
    registerForm.hidden = true;
    registerDone.hidden = false;
  } catch (x) {
    err.textContent = (x as Error).message;
  } finally {
    btn.disabled = false;
  }
});
document.querySelectorAll<HTMLElement>('[data-goto]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    const to = a.dataset.goto as Screen;
    show(to);
    if (to === 'login' && a.hasAttribute('data-use-code') && requestedCode) slots.setValue(requestedCode);
    (document.querySelector(`[data-screen="${to}"] h1`) as HTMLElement | null)?.focus?.();
  }),
);

// ---------- attachments: paperclip, upload, chips ----------
/* Each file is uploaded right away (one request per file, raw bytes) and sent with the next
   message. The server checks type and size again; these checks only give a quick answer. */
const FILE_ONLY = 'Bitte schau dir meine Datei an.';
const MAX_FILES = 3;
const MAX_MB = 5;
const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const fileInput = $<HTMLInputElement>('[data-file-input]');
const trayBox = $<HTMLElement>('[data-tray]');
const trayList = $<HTMLElement>('[data-tray-files]');
interface TrayItem {
  key: number;
  name: string;
  state: 'laedt' | 'fertig' | 'fehler';
  ref?: FileRef;
  error?: string;
}
let tray: TrayItem[] = [];
let trayKey = 0;
let trayNote = '';

function renderTray() {
  trayBox.hidden = !tray.length && !trayNote;
  trayList.innerHTML = tray
    .map(
      (t) => `<li class="file${t.state === 'fehler' ? ' is-error' : ''}"><span class="file__name">${esc(t.name)}</span>${
        t.state === 'laedt' ? '<span class="file__state">lädt</span>' : t.state === 'fehler' ? `<span class="file__state">${esc(t.error ?? '')}</span>` : ''
      }<button type="button" class="file__del" data-tray-del="${t.key}" aria-label="${esc(t.name)} entfernen">×</button></li>`,
    )
    .join('') + (trayNote ? `<li class="tray__msg" role="alert">${esc(trayNote)}</li>` : '');
}
function trayMessage(msg: string) {
  trayNote = msg;
  renderTray();
}

async function deleteOnServer(id: string) {
  await fetch('/api/datei', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, id, aktion: 'loeschen' }) }).catch(() => {});
}

/** removeFromServer: true when the files were never sent (view switch, logout) */
function clearTray(removeFromServer: boolean) {
  if (removeFromServer) tray.filter((t) => t.ref).forEach((t) => deleteOnServer(t.ref!.id));
  tray = [];
  trayNote = '';
  renderTray();
}

async function uploadOne(item: TrayItem, file: File) {
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-code': code, 'x-ziel': view === 'mentor' ? 'mentor' : 'ki', 'x-dateiname': encodeURIComponent(file.name) },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.file) throw new Error(data.error ?? 'Das hat nicht geklappt.');
    item.state = 'fertig';
    item.ref = { id: data.file.id, name: data.file.name, type: data.file.type, size: data.file.size };
  } catch (x) {
    item.state = 'fehler';
    item.error = (x as Error).message;
  }
  renderTray();
}

$<HTMLButtonElement>('[data-attach]').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  trayNote = '';
  for (const file of [...(fileInput.files ?? [])]) {
    if (tray.filter((t) => t.state !== 'fehler').length >= MAX_FILES) {
      trayNote = `Höchstens ${MAX_FILES} Dateien pro Nachricht.`;
      break;
    }
    const item: TrayItem = { key: ++trayKey, name: file.name, state: 'laedt' };
    const okType = OK_TYPES.includes(file.type) || /\.(pdf|docx|png|jpe?g)$/i.test(file.name);
    if (!okType) Object.assign(item, { state: 'fehler', error: 'Nur PDF, DOCX, PNG oder JPG.' });
    else if (file.size > MAX_MB * 1024 * 1024) Object.assign(item, { state: 'fehler', error: `Größer als ${MAX_MB} MB.` });
    tray.push(item);
    if (item.state === 'laedt') uploadOne(item, file);
  }
  fileInput.value = '';
  renderTray();
});
trayList.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tray-del]');
  if (!btn) return;
  const item = tray.find((t) => t.key === Number(btn.dataset.trayDel));
  if (item?.ref) deleteOnServer(item.ref.id);
  tray = tray.filter((t) => t !== item);
  trayNote = '';
  renderTray();
});

/** download a file through the session, never through a public link */
async function download(url: string, body: object, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return (await res.json().catch(() => ({}))).error ?? 'Das hat nicht geklappt.';
    const href = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
    return null;
  } catch {
    return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
  }
}

// open and delete files in both conversations
for (const area of [log, mentorLog]) {
  area.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const open = t.closest<HTMLButtonElement>('[data-open-file]');
    if (open) {
      const err = await download('/api/datei', { code, id: open.dataset.openFile, aktion: 'holen' }, open.dataset.name ?? 'datei');
      if (err) open.closest('.file')?.classList.add('is-gone');
      return;
    }
    const del = t.closest<HTMLButtonElement>('[data-del-file]');
    if (!del || !confirm('Diese Datei löschen?')) return;
    const id = del.dataset.delFile!;
    await deleteOnServer(id);
    for (const m of state.messages) m.dateien?.forEach((f) => f.id === id && (f.geloescht = true));
    for (const m of mentorMessages) m.dateien?.forEach((f) => f.id === id && (f.geloescht = true));
    save();
    const li = del.closest('.file')!;
    li.classList.add('is-gone');
    li.innerHTML = `<span class="file__name">${esc(li.querySelector('.file__name')?.textContent ?? '')}</span><span class="file__state">gelöscht</span>`;
  });
}

// ---------- templates (logged-in only) ----------
document.querySelector<HTMLButtonElement>('[data-action="vorlagen"]')?.addEventListener('click', () => {
  (document.querySelector('.menu') as HTMLDetailsElement | null)?.removeAttribute('open');
  show('vorlagen');
  window.scrollTo({ top: 0 });
});
$<HTMLButtonElement>('[data-action="zurueck"]').addEventListener('click', () => {
  show('chat');
  scrollDown(true);
});
document.querySelectorAll<HTMLButtonElement>('[data-vorlage]').forEach((b) =>
  b.addEventListener('click', async () => {
    const err = $<HTMLElement>('[data-vorlage-error]');
    err.textContent = '';
    b.disabled = true;
    const names: Record<string, string> = {
      schueler: 'Lebenslauf-Vorlage-1-Schueler.docx',
      wirtschaft: 'Lebenslauf-Vorlage-2-Wirtschaft-Finanzen-Beratung.docx',
      technik: 'Lebenslauf-Vorlage-3-Technik-Informatik-Naturwissenschaften.docx',
      kreativ: 'Portfolio-Vorlage-4-Kreativ-Medien-Design.pptx',
    };
    const problem = await download('/api/vorlage', { code, id: b.dataset.vorlage }, names[b.dataset.vorlage!] ?? 'vorlage');
    if (problem) err.textContent = problem;
    b.disabled = false;
  }),
);

// ---------- login, logout, delete ----------
const loginForm = $<HTMLFormElement>('[data-form="login"]');
const parentsBox = $<HTMLElement>('[data-parents]');
loginForm.addEventListener('change', () => {
  const under16 = (loginForm.elements.namedItem('alter') as RadioNodeList).value === 'unter16';
  parentsBox.hidden = !under16;
  (loginForm.elements.namedItem('eltern') as HTMLInputElement).required = under16;
});
const CODE_WRONG = 'Dieser Code passt nicht. Bitte prüfe ihn noch einmal.';
const codeStatus = $<HTMLElement>('[data-code-status]');
let checking = false;
const slots = createCodeSlots($<HTMLElement>('[data-code-slots]'), loginForm.elements.namedItem('code') as HTMLInputElement, () => {
  // all slots filled: check right away if the rest of the form is ready, else wait for the button
  if (!checking && loginForm.checkValidity()) loginForm.requestSubmit();
});
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (checking) return;
  const err = $<HTMLElement>('[data-error]');
  err.textContent = '';
  if (!slots.complete() || !loginForm.checkValidity()) {
    err.textContent = 'Bitte gib deinen Code ein und bestätige die Hinweise.';
    if (!slots.complete()) slots.focus();
    else loginForm.reportValidity();
    return;
  }
  const value = slots.value();
  const btn = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  btn.disabled = true;
  checking = true;
  slots.setState('checking');
  const loader = createLatticeLoader({ label: 'Code wird geprüft', showTimer: false, cellSize: 4, gap: 2, fontSize: 12, color: '#0066CC' });
  codeStatus.replaceChildren(loader.el);
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: value }) });
    if (res.status === 401) throw new Error(CODE_WRONG);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Das hat nicht geklappt.');
    code = value;
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {
      /* stays logged in for this visit only */
    }
    loader.destroy();
    slots.setState('success');
    await new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 650));
    enterChat();
  } catch (x) {
    loader.destroy();
    slots.setState('error');
    err.textContent = (x as Error).message;
    slots.focus();
  } finally {
    checking = false;
    btn.disabled = false;
  }
});

function enterChat() {
  state = { mode: 'orientierung', profile: {}, messages: [], saved: [] };
  load();
  show('chat');
  setMode(state.mode);
  renderAll();
  if (state.mentorSent) slider.markDone(false);
  else slider.reset();
  if (state.mentorThread) openMentorThread(false);
  else closeMentorThread();
  if (!state.messages.some((m) => m.role === 'assistant')) {
    state.messages = [];
    showWelcome(true);
  } else showWelcome(false);
  input.focus();
}

/* ---------- empty state: greeting and start suggestions ---------- */
const welcome = $<HTMLElement>('[data-welcome]');
function showWelcome(on: boolean) {
  welcome.hidden = !on;
  document.querySelector('.chat')?.classList.toggle('is-empty', on);
  if (on) $<HTMLElement>('[data-mentor-slot]').hidden = true;
}
document.querySelectorAll<HTMLButtonElement>('[data-start]').forEach((b) =>
  b.addEventListener('click', () => {
    setMode(b.dataset.start as Mode);
    showWelcome(false);
    send(b.querySelector('.start__title')!.textContent!.trim());
  }),
);

function logout() {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing stored */
  }
  closeMentorThread();
  clearTray(true);
  code = '';
  log.innerHTML = '';
  loginForm.reset();
  slots.clear();
  parentsBox.hidden = true;
  show('login');
}
$<HTMLButtonElement>('[data-action="logout"]').addEventListener('click', logout);
$<HTMLButtonElement>('[data-action="delete"]').addEventListener('click', () => {
  if (!confirm('Profil, Verlauf und gemerkte Angebote in diesem Browser löschen?')) return;
  try {
    localStorage.removeItem(storeKey());
  } catch {
    /* nothing stored */
  }
  logout();
});

// already logged in on this device?
try {
  code = localStorage.getItem(CODE_KEY) ?? '';
} catch {
  code = '';
}
if (code) enterChat();
else show(location.hash === '#zugang' ? 'register' : 'login');
window.addEventListener('hashchange', () => {
  if (!code) show(location.hash === '#zugang' ? 'register' : 'login');
});
