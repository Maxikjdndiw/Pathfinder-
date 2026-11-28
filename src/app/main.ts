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
import './theme.css';
import { parseMarkers, visibleText, type ModeButton, type Recommendation } from './markers';
import { createSlideConfirm, type SlideResult } from './slide-confirm';
import { createCodeSlots } from './code-slots';
import type { MapHandle } from './map';
import { createLatticeLoader } from '../components/lattice-loader';
import { daysLabel, daysLeft, renderDashboard, renderTicker, sourceFor } from './dashboard';
import { openPhotoDialog } from './profile-photo';
import {
  COST_LABELS as PILL_LABELS,
  COST_STEPS,
  ALEVEL_GRADES,
  defaultFilters,
  emptyFit,
  FIELD_LABEL,
  FIT_LABEL,
  SELEKTIV_LABEL,
  filterOffers,
  fitFor,
  LEISTUNGSFAECHER,
  formatDate,
  formatEuro,
  isPast,
  OFFERS,
  RECHTSFORM_LABEL,
  SPRACHE_LABEL,
  STUFE_LABEL,
  TYP_LABEL,
  type Filters,
  type FitProfile,
  type FitStatus,
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
  /** the open tab */
  mode: Mode;
  /** one profile per access code, shared by all tabs */
  profile: Record<string, unknown>;
  /** one conversation per tab; only the open tab's history goes to the server */
  chats: Record<Mode, Msg[]>;
  saved: string[];
  /** first name from the signup, returned by /api/login (empty for fixed codes) */
  name?: string;
  /** a mentor request was sent from this browser */
  mentorSent?: boolean;
  /** the request created a direct chat with the mentor (false: it went out as a backup form only) */
  mentorThread?: boolean;
  /** time of the newest mentor message the student has seen */
  mentorSeen?: string;
}

const MENTOR = '[[SYSTEM: MENTOR_ANFRAGE]]';
/** first message of a tab: the coach opens the conversation with the profile it knows */
const START = '[[SYSTEM: START]]';
const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- storage (this browser only) ----------
const CODE_KEY = 'pf-app:code';
let code = '';
const MODE_LIST: Mode[] = ['orientierung', 'cv_linkedin', 'praktika', 'studium'];
const emptyChats = (): Record<Mode, Msg[]> => ({ orientierung: [], cv_linkedin: [], praktika: [], studium: [] });
const freshState = (): State => ({ mode: 'orientierung', profile: {}, chats: emptyChats(), saved: [] });
let state: State = freshState();
/** the open tab's conversation */
const chat = () => state.chats[state.mode];
const hasReply = (msgs: Msg[]) => msgs.some((m) => m.role === 'assistant');
const storeKey = () => `pf-app:${code}`;
function load() {
  try {
    const raw = localStorage.getItem(storeKey());
    if (!raw) return;
    const { messages, chats, ...rest } = JSON.parse(raw);
    state = { ...state, ...rest, chats: emptyChats() };
    if (!MODE_LIST.includes(state.mode)) state.mode = 'orientierung';
    for (const m of MODE_LIST) if (Array.isArray(chats?.[m])) state.chats[m] = chats[m];
    // older version: one shared chat, it becomes the chat of the tab it was in
    if (!chats && Array.isArray(messages)) state.chats[state.mode] = messages;
  } catch {
    /* private mode or broken data: start fresh */
  }
}
// fit check profile ("Passt das?"): grades stay in this browser, never sent to the server
const fitKey = () => `${storeKey()}:fit`;
let fitProfile: FitProfile = emptyFit();
function loadFit() {
  fitProfile = emptyFit();
  try {
    const raw = localStorage.getItem(fitKey());
    if (raw) fitProfile = { ...fitProfile, ...JSON.parse(raw) };
  } catch {
    /* private mode or broken data: no grades */
  }
}
function saveFit() {
  try {
    localStorage.setItem(fitKey(), JSON.stringify(fitProfile));
  } catch {
    /* storage blocked: the fit check works for this visit only */
  }
}
const fitSummary = (p: FitProfile) =>
  p.abschluss === 'abitur'
    ? `Abitur ${p.note.toFixed(1).replace('.', ',')}`
    : p.abschluss === 'ib'
      ? `IB ${p.ib} Punkte`
      : p.abschluss === 'alevel'
        ? `A-Levels ${p.alevel.join('')}`
        : 'Noten eingeben';

function save() {
  try {
    const chats = Object.fromEntries(MODE_LIST.map((m) => [m, state.chats[m].slice(-60)]));
    localStorage.setItem(storeKey(), JSON.stringify({ ...state, chats }));
  } catch {
    /* storage full or blocked: the chat still works for this visit */
  }
}

// ---------- screens ----------
type Screen = 'login' | 'register' | 'dashboard' | 'chat' | 'vorlagen';
function show(screen: Screen) {
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => (el.hidden = el.dataset.screen !== screen));
  document.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => (el.hidden = !el.dataset.when!.split(' ').includes(screen)));
  if (screen === 'login' || screen === 'register') history.replaceState(null, '', screen === 'register' ? '#zugang' : location.pathname);
}

const log = $<HTMLElement>('[data-log]');
// "Kopieren" under text blocks: copies the text, shows "Kopiert" for a moment
log.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-copy]');
  if (!btn) return;
  const text = btn.parentElement?.querySelector('pre')?.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Kopiert';
  } catch {
    btn.textContent = 'Bitte markieren und kopieren';
  }
  window.setTimeout(() => (btn.textContent = 'Kopieren'), 1800);
});
const input = $<HTMLTextAreaElement>('#chat-input');
const chatForm = $<HTMLFormElement>('[data-form="chat"]');
let busy = false;
/** which conversation the composer writes to */
let view: 'coach' | 'mentor' = 'coach';

function setMode(mode: Mode) {
  state.mode = mode;
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.classList.toggle('is-current', b.dataset.tab === mode);
    b.setAttribute('aria-selected', String(b.dataset.tab === mode));
  });
  updateMentorSlot();
}

/** Opens a tab with its own chat exactly as it was left. An empty tab starts its conversation. */
function openTab(mode: Mode, start = true) {
  if (busy) return;
  if (view === 'mentor') setView('coach');
  if (mode !== state.mode) {
    setMode(mode);
    clearTray(true);
    save();
    renderAll();
  }
  const empty = !hasReply(chat());
  if (empty) state.chats[mode] = [];
  const first = MODE_LIST.every((m) => !hasReply(state.chats[m]));
  showWelcome(empty && first);
  if (empty && !first && start) send(START, { hidden: true });
  input.focus({ preventScroll: true });
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab as Mode)));

/** The mentor slider belongs to the CV and internship parts, not to orientation. */
function updateMentorSlot() {
  const slot = $<HTMLElement>('[data-mentor-slot]');
  slot.hidden = view === 'mentor' || state.mode === 'orientierung' || !hasReply(chat());
}

// ---------- rendering of messages ----------
/** Small, safe formatting: paragraphs, lists, code blocks for CV templates, **bold**. */
function format(text: string): string {
  const parts = text.split(/```[a-z]*\n?/);
  return parts
    .map((part, i) => {
      // text to take over (CV section, LinkedIn area): with a copy button underneath
      if (i % 2 === 1) return `<div class="msg__code"><pre class="msg__pre">${esc(part.trim())}</pre><button type="button" class="btn btn--quiet btn--small msg__copy" data-copy>Kopieren</button></div>`;
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

const AVATAR = '<span class="msg__avatar" aria-hidden="true"><img src="/pathfinder-mark.svg" alt="" width="18" height="18" /></span>';
function bubble(role: Msg['role'], html: string, files?: FileRef[]): HTMLElement {
  const el = document.createElement('div');
  el.className = `msg msg--${role === 'user' ? 'me' : 'coach'}`;
  el.innerHTML = `${role === 'user' ? '' : AVATAR}${fileChips(files, role === 'user')}${html ? `<div class="msg__body">${html}</div>` : ''}`;
  if (role !== 'user' && !html) el.innerHTML = `${AVATAR}<div class="msg__body"></div>`;
  log.appendChild(el);
  return el;
}

function renderAll() {
  log.innerHTML = '';
  const msgs = chat();
  const lastAssistant = msgs.map((m) => m.role).lastIndexOf('assistant');
  // only the newest cards or map block is shown; older ones were replaced by it
  const lastVisual = msgs.reduce((acc, m, i) => {
    if (m.role !== 'assistant') return acc;
    const p = parseMarkers(m.content);
    return p.map || p.recommendation ? i : acc;
  }, -1);
  msgs.forEach((m, i) => {
    if (m.hidden) return;
    if (m.role === 'user') return void bubble('user', m.dateien?.length && m.content === FILE_ONLY ? '' : format(m.content), m.dateien);
    const parsed = parseMarkers(m.content);
    const el = bubble('assistant', format(parsed.text));
    const b = el.querySelector<HTMLElement>('.msg__body');
    if (b) renderSources(b, parsed.sources);
    renderDeadlineCards(el, parsed.deadlines);
    if (i === lastVisual) {
      const rec = parsed.recommendation;
      const withMap = Boolean(parsed.map) || Boolean(rec?.typen.some((x) => x === 'hochschule' || x === 'studiengang'));
      if (rec) renderRecommendations(el, rec, withMap ? { map: true, highlight: parsed.map } : {});
      else if (parsed.map) renderMapOnly(el, parsed.map);
    }
    if (i === lastAssistant) renderActions(el, parsed.options, parsed.buttons, parsed.followups);
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
function renderActions(after: HTMLElement, options: string[], buttons: ModeButton[], followups: string[] = []) {
  if (!options.length && !buttons.length && !followups.length) return;
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
      // opens the existing chat of that tab, never a second one
      btn.addEventListener('click', () => openTab(b.mode));
      row.appendChild(btn);
    });
    box.appendChild(row);
  }
  if (followups.length && !options.length) {
    const row = document.createElement('div');
    row.className = 'follow';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Mögliche Anschlussfragen');
    followups.forEach((q) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip-s';
      btn.textContent = q;
      btn.addEventListener('click', () => send(q));
      row.appendChild(btn);
    });
    box.appendChild(row);
  }
  after.appendChild(box);
}

/** source chips under an answer: name and the date it was last verified */
function renderSources(body: HTMLElement, ids: string[]) {
  const refs = ids.map((id) => sourceFor(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const seen = new Set<string>();
  const list = refs.filter((r) => !seen.has(r.name + r.url) && seen.add(r.name + r.url));
  if (!list.length) return;
  const box = document.createElement('div');
  box.className = 'srcs';
  box.setAttribute('aria-label', 'Quellen');
  box.innerHTML = list
    .map((r) => {
      const inner = `${esc(r.name)}<span class="src__date">${r.verified ? `geprüft am ${esc(formatDate(r.verified))}` : 'noch nicht geprüft'}</span>`;
      return r.url ? `<a class="src" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<span class="src">${inner}</span>`;
    })
    .join('');
  body.after(box);
}

/** recommended deadlines as small cards with a countdown and "Zu Meine Fristen hinzufügen" */
function renderDeadlineCards(after: HTMLElement, items: { id: string; grund: string }[]) {
  const list = items.map((d) => ({ ...d, o: OFFERS.find((x) => x.id === d.id) })).filter((d): d is { id: string; grund: string; o: Offer } => Boolean(d.o));
  if (!list.length) return;
  const box = document.createElement('div');
  box.className = 'dl-cards';
  box.innerHTML = list
    .map(({ o, grund }) => {
      const days = o.frist && /^\d{4}-\d{2}-\d{2}$/.test(o.frist) ? daysLeft(o.frist) : null;
      const on = state.saved.includes(o.id);
      return `<article class="dl-card">
        <div class="dl-card__top"><span class="dl-card__type">${esc(TYP_LABEL[o.typ] ?? o.typ)}</span>${days === null ? '<span class="pill pill--quiet">Frist offen</span>' : `<span class="pill${days < 0 ? ' pill--past' : ''}">${daysLabel(days)}</span>`}</div>
        <h4 class="dl-card__title">${esc(o.name)}</h4>
        ${grund ? `<p class="dl-card__why">${esc(grund)}</p>` : ''}
        <p class="dl-card__date">${days === null ? 'Keine feste Frist bekannt' : `Frist ${esc(formatDate(o.frist))}`}, zuletzt geprüft am ${esc(formatDate(o.zuletzt_geprueft))}</p>
        <button type="button" class="qbtn" data-save="${o.id}" data-save-kind="frist" aria-pressed="${on}">${on ? 'In Meine Fristen' : 'Zu Meine Fristen hinzufügen'}</button>
      </article>`;
    })
    .join('');
  box.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => b.addEventListener('click', () => toggleSaved(b.dataset.save!)));
  after.appendChild(box);
}

// ---------- recommendation cards ----------
const COST_LABELS = COST_STEPS.map((v, i) => (i === COST_STEPS.length - 1 ? `${formatEuro(v)} oder mehr` : formatEuro(v)));
let recCount = 0;
/** the cards block on screen; a newer one replaces it */
let liveRecs: HTMLElement | null = null;

function renderRecommendations(after: HTMLElement, rec: Recommendation, mapOpts: { map?: boolean; highlight?: string[] | null } = {}) {
  const id = `rec-${++recCount}`;
  const stufe = (rec.stufe ?? (state.profile.stufe as Stufe | undefined) ?? null) as Stufe | null;
  // the offers the coach talks about (ids=), only real ones from angebote.json
  const pinned = rec.ids.map((x) => OFFERS.find((o) => o.id === x)).filter((o): o is Offer => Boolean(o));
  // filters the coach did not set follow the pinned offers
  const typen = rec.typen.length ? rec.typen : [...new Set(pinned.map((o) => o.typ))];
  const land =
    rec.land ??
    (pinned.length && pinned.every((o) => o.land === 'DE') ? 'de' : pinned.length && pinned.every((o) => o.land !== 'DE' && !o.online) ? 'ausland' : null);
  const felder = rec.felder.length ? rec.felder : [...new Set(pinned.flatMap((o) => o.felder))];
  // every block starts from fresh filters (no merging with the older block)
  const f: Filters = defaultFilters(felder, stufe, typen, land, rec.sprachen, rec.kosten);
  // the cost slider follows the budget: the smallest step that still covers it
  if (f.budget !== null) {
    const step = COST_STEPS.findIndex((x) => x >= f.budget!);
    f.kostenMax = step < 0 ? COST_STEPS.length - 1 : step;
  }
  const isStudy = (o: Offer) => o.typ === 'hochschule' || o.typ === 'studiengang';
  // the fit check belongs to universities: Studium mode or a block that shows universities
  const showFit = state.mode === 'studium' || f.typen.some((t) => t === 'hochschule' || t === 'studiengang') || pinned.some(isStudy);
  const fieldsAvailable = [...new Set([...rec.felder, ...OFFERS.flatMap((o) => o.felder)])].filter((x) => FIELD_LABEL[x]);
  // the newest block replaces the older one, so cards and maps never stack up
  if (liveRecs) liveRecs.remove();
  const box = document.createElement('section');
  box.className = 'recs';
  liveRecs = box;
  box.setAttribute('aria-labelledby', `${id}-title`);
  box.innerHTML = `
    <h3 class="recs__title" id="${id}-title">Angebote für dich</h3>
    <p class="recs__note">Fristen und Kosten immer beim Anbieter prüfen.</p>
    <details class="recs__filters">
      <summary>Filter</summary>
      <div class="filter-grid">
        <label class="field"><span class="field__label">Land</span>
          <select class="input" data-f="land"><option value="alle">Alle</option><option value="de">Deutschland</option><option value="ausland">Ausland</option><option value="online">Online</option></select></label>
        <label class="field"><span class="field__label">Rechtsform</span>
          <select class="input" data-f="rechtsform"><option value="alle">Alle</option><option value="oeffentlich">Öffentlich</option><option value="privat">Privat</option></select></label>
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
            ${f.budget !== null ? `<button type="button" class="chip" aria-pressed="true" data-budget>Budget aus dem Gespräch: bis ${formatEuro(f.budget)}</button>` : ''}
          </div>
        </div>
        <div class="field field--wide"><span class="field__label">Typ</span>
          <div class="chips chips--small" data-typen>${(Object.keys(TYP_LABEL) as Typ[]).map((t) => `<button type="button" class="chip" aria-pressed="${f.typen.includes(t)}" data-typ="${t}">${TYP_LABEL[t]}</button>`).join('')}</div></div>
        <div class="field field--wide"><span class="field__label">Sprache</span>
          <div class="chips chips--small" data-sprachen>${Object.entries(SPRACHE_LABEL).map(([c, l]) => `<button type="button" class="chip" aria-pressed="${f.sprachen.includes(c)}" data-sprache="${c}">${l}</button>`).join('')}</div></div>
        ${showFit ? `<div class="field field--wide"><span class="field__label">Richtwerte</span>
          <div class="chips chips--small"><button type="button" class="chip" aria-pressed="false" data-nur-passende>Nur Passende</button></div></div>` : ''}
        <div class="field field--wide"><span class="field__label">Felder</span>
          <div class="chips chips--small" data-felder>${fieldsAvailable.map((x) => `<button type="button" class="chip" aria-pressed="${rec.felder.includes(x)}" data-feld="${x}">${esc(FIELD_LABEL[x])}</button>`).join('')}</div></div>
      </div>
    </details>
    ${showFit ? `<details class="fit">
      <summary>Passt das? <span class="fit__sum" data-fit-sum></span></summary>
      <div class="filter-grid fit__body">
        <label class="field"><span class="field__label">Abschluss</span>
          <select class="input" data-fit="abschluss"><option value="">Bitte wählen</option><option value="abitur">Abitur</option><option value="ib">IB</option><option value="alevel">A-Levels</option></select></label>
        <label class="field" data-fit-only="abitur"><span class="field__label">Note (1,0 bis 4,0)</span>
          <select class="input" data-fit="note">${Array.from({ length: 31 }, (_, i) => (1 + i / 10).toFixed(1)).map((n) => `<option value="${n}">${n.replace('.', ',')}</option>`).join('')}</select></label>
        <label class="field" data-fit-only="ib"><span class="field__label">Punkte (24 bis 45)</span>
          <select class="input" data-fit="ib">${Array.from({ length: 22 }, (_, i) => 45 - i).map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
        <div class="field" data-fit-only="alevel" role="group" aria-labelledby="${id}-al"><span class="field__label" id="${id}-al">A-Level Noten</span>
          <div class="fit__alevel">${[0, 1, 2].map((i) => `<select class="input" data-fit-al="${i}" aria-label="Note ${i + 1}">${ALEVEL_GRADES.map((g) => `<option value="${g}">${g}</option>`).join('')}</select>`).join('')}</div></div>
        <div class="field field--wide"><span class="field__label">Leistungskurs / Higher Level</span>
          <div class="chips chips--small">${Object.entries(LEISTUNGSFAECHER).map(([k, l]) => `<button type="button" class="chip" aria-pressed="${fitProfile.faecher.includes(k)}" data-lk="${k}">${l}</button>`).join('')}</div></div>
        <div class="field field--wide"><button type="button" class="btn btn--quiet btn--small fit__recheck" data-fit-recheck>Neu prüfen</button></div>
      </div>
    </details>
    <p class="fit__note">Ungefähre Einschätzung, keine Zulassungsgarantie. Bitte die offiziellen Voraussetzungen prüfen.</p>` : ''}
    <div data-map-slot></div>
    <p class="recs__count" data-count aria-live="polite"></p>
    <div class="cards" data-cards></div>`;
  after.appendChild(box);
  let map: Promise<MapHandle | null> | null = null;
  if (mapOpts.map) map = attachMap(box.querySelector<HTMLElement>('[data-map-slot]')!, mapOpts.highlight?.length ? mapOpts.highlight : rec.ids.length ? rec.ids : null);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    f[k] = v;
    update();
  };
  const sel = (k: string) => box.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-f="${k}"]`)!;
  sel('land').value = f.land;
  sel('rechtsform').value = f.rechtsform;
  sel('stufe').value = f.stufe;
  sel('sort').value = f.sort;
  sel('land').addEventListener('change', (e) => set('land', (e.target as HTMLSelectElement).value as Filters['land']));
  sel('rechtsform').addEventListener('change', (e) => set('rechtsform', (e.target as HTMLSelectElement).value as Filters['rechtsform']));
  sel('stufe').addEventListener('change', (e) => set('stufe', (e.target as HTMLSelectElement).value as Filters['stufe']));
  sel('sort').addEventListener('change', (e) => set('sort', (e.target as HTMLSelectElement).value as Filters['sort']));
  const minEl = sel('kostenMin');
  const maxEl = sel('kostenMax');
  minEl.value = String(f.kostenMin);
  maxEl.value = String(f.kostenMax);
  // moving the slider or a cost chip replaces the budget from the conversation
  const budgetChip = box.querySelector<HTMLButtonElement>('[data-budget]');
  const dropBudget = () => {
    f.budget = null;
    budgetChip?.remove();
  };
  budgetChip?.addEventListener('click', () => {
    dropBudget();
    f.kostenMax = COST_STEPS.length - 1;
    maxEl.value = String(f.kostenMax);
    update();
  });
  minEl.addEventListener('input', () => {
    dropBudget();
    f.kostenMin = Math.min(Number(minEl.value), f.kostenMax);
    minEl.value = String(f.kostenMin);
    update();
  });
  maxEl.addEventListener('input', () => {
    dropBudget();
    f.kostenMax = Math.max(Number(maxEl.value), f.kostenMin);
    maxEl.value = String(f.kostenMax);
    update();
  });
  box.querySelectorAll<HTMLElement>('[data-cost]').forEach((b) =>
    b.addEventListener('click', () => {
      dropBudget();
      const [a, c] = b.dataset.cost!.split(',').map(Number);
      f.kostenMin = a;
      f.kostenMax = c;
      minEl.value = String(a);
      maxEl.value = String(c);
      update();
    }),
  );
  const toggleGroup = (attr: string, key: 'typen' | 'felder' | 'sprachen') =>
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
  toggleGroup('sprache', 'sprachen');
  box.querySelector<HTMLButtonElement>('[data-nur-passende]')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    f.nurPassende = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(f.nurPassende));
    update();
  });
  if (showFit) {
    const fitSel = (k: string) => box.querySelector<HTMLSelectElement>(`[data-fit="${k}"]`)!;
    const alSels = [...box.querySelectorAll<HTMLSelectElement>('[data-fit-al]')];
    const syncFit = () => {
      fitSel('abschluss').value = fitProfile.abschluss ?? '';
      fitSel('note').value = fitProfile.note.toFixed(1);
      fitSel('ib').value = String(fitProfile.ib);
      alSels.forEach((s, i) => (s.value = fitProfile.alevel[i] ?? 'A'));
      box.querySelectorAll<HTMLElement>('[data-fit-only]').forEach((el) => (el.hidden = el.dataset.fitOnly !== fitProfile.abschluss));
      box.querySelector('[data-fit-sum]')!.textContent = fitSummary(fitProfile);
    };
    const changed = () => {
      saveFit();
      syncFit();
      update();
    };
    // recomputes pills, order and map dimming (also with grades changed in another tab)
    box.querySelector<HTMLButtonElement>('[data-fit-recheck]')!.addEventListener('click', () => {
      loadFit();
      box.querySelectorAll<HTMLElement>('[data-lk]').forEach((b) => b.setAttribute('aria-pressed', String(fitProfile.faecher.includes(b.dataset.lk!))));
      syncFit();
      update();
    });
    fitSel('abschluss').addEventListener('change', (e) => {
      fitProfile.abschluss = ((e.target as HTMLSelectElement).value || null) as FitProfile['abschluss'];
      changed();
    });
    fitSel('note').addEventListener('change', (e) => {
      fitProfile.note = Number((e.target as HTMLSelectElement).value);
      changed();
    });
    fitSel('ib').addEventListener('change', (e) => {
      fitProfile.ib = Number((e.target as HTMLSelectElement).value);
      changed();
    });
    alSels.forEach((s, i) =>
      s.addEventListener('change', () => {
        fitProfile.alevel = [...fitProfile.alevel];
        fitProfile.alevel[i] = s.value;
        changed();
      }),
    );
    box.querySelectorAll<HTMLButtonElement>('[data-lk]').forEach((b) =>
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on));
        const k = b.dataset.lk!;
        fitProfile.faecher = on ? [...new Set([...fitProfile.faecher, k])] : fitProfile.faecher.filter((x) => x !== k);
        changed();
      }),
    );
    syncFit();
  }

  function update() {
    box.querySelector('[data-cost-out]')!.textContent = `${COST_LABELS[f.kostenMin]} bis ${COST_LABELS[f.kostenMax]}`;
    // pinned offers first (always shown), then the rest that matches the filters
    const pinnedIds = new Set(pinned.map((o) => o.id));
    const fitP = showFit ? fitProfile : null;
    const list = [...pinned, ...filterOffers(OFFERS, f, new Date(), fitP).filter((o) => !pinnedIds.has(o.id))];
    const known = rec.felder.filter((x) => OFFERS.some((o) => o.felder.includes(x)));
    box.querySelector('[data-count]')!.textContent = list.length
      ? `${list.length} ${list.length === 1 ? 'Angebot' : 'Angebote'}`
      : known.length
        ? 'Keine Treffer.'
        : 'Noch keine geprüften Angebote für diese Felder.';
    box.querySelector('[data-cards]')!.innerHTML = list.map((o) => card(o, pinnedIds.has(o.id), fitP)).join('');
    // the map keeps every university and only dims the ones that do not match (and by the fit check)
    const fitMap = new Map<string, FitStatus>();
    if (fitP) for (const o of UNIS) {
      const r = fitFor(o, fitP);
      if (r) fitMap.set(o.id, r.status);
    }
    map?.then((m) => m?.setMatching(new Set(list.map((o) => o.id)), fitMap));
    box.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((b) => b.addEventListener('click', () => toggleSaved(b.dataset.save!)));
  }
  update();
}

// ---------- saving: ids per access code in this browser, "Meine Fristen" on the dashboard reads them ----------
const saveButton = (o: Offer, on: boolean) =>
  `<button type="button" class="btn btn--quiet btn--small offer__save" data-save="${o.id}" aria-pressed="${on}" aria-label="${on ? 'Gespeichert' : 'Speichern'}: ${esc(o.name)}">${on ? 'Gespeichert' : 'Speichern'}</button>`;
function syncSaveButtons(id: string) {
  const on = state.saved.includes(id);
  const o = OFFERS.find((x) => x.id === id);
  document.querySelectorAll<HTMLButtonElement>(`[data-save="${id}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    if (b.dataset.saveKind === 'frist') return void (b.textContent = on ? 'In Meine Fristen' : 'Zu Meine Fristen hinzufügen');
    b.textContent = on ? 'Gespeichert' : 'Speichern';
    b.setAttribute('aria-label', `${on ? 'Gespeichert' : 'Speichern'}: ${o?.name ?? ''}`);
  });
}
/** saves an offer id from angebote.json for this student; unknown ids are ignored */
export function saveItem(id: string, on = true) {
  if (!OFFERS.some((o) => o.id === id)) return;
  state.saved = on ? [...new Set([...state.saved, id])] : state.saved.filter((x) => x !== id);
  save();
  syncSaveButtons(id);
}
const toggleSaved = (id: string) => saveItem(id, !state.saved.includes(id));

function card(o: Offer, pinned = false, fitP: FitProfile | null = null): string {
  const fit = fitFor(o, fitP);
  const study = o.typ === 'hochschule' || o.typ === 'studiengang';
  const cost =
    o.kosten_pro_jahr_eur === null
      ? o.kosten_hinweis ? 'Siehe Hinweis' : 'Kosten unbekannt'
      : o.kosten_pro_jahr_eur === 0 && !o.kosten_bis_eur
        ? study ? 'Nur Semesterbeitrag' : 'Kostenlos'
        : o.kosten_bis_eur
          ? `${formatEuro(o.kosten_pro_jahr_eur)} bis ${formatEuro(o.kosten_bis_eur)} pro Jahr`
          : `${formatEuro(o.kosten_pro_jahr_eur)} pro Jahr`;
  const place = [o.ort, o.online ? 'online' : ''].filter(Boolean).join(', ');
  const past = isPast(o.frist);
  const frist = o.frist ? `${formatDate(o.frist)}${past ? ' (abgelaufen)' : ''}` : 'noch nicht bekannt';
  const saved = state.saved.includes(o.id);
  return `<article class="offer${pinned ? ' offer--pinned' : ''}">
    <div class="offer__top">
      <span class="offer__typ">${TYP_LABEL[o.typ] ?? esc(o.typ)}</span>
      ${o.kosten_label && PILL_LABELS.includes(o.kosten_label) ? `<span class="offer__label offer__label--${esc(o.kosten_label.replace(/\s+/g, '-'))}">${esc(o.kosten_label)}</span>` : ''}
      ${o.rechtsform ? `<span class="offer__form offer__form--${o.rechtsform}">${RECHTSFORM_LABEL[o.rechtsform]}</span>` : ''}
      ${o.sprache === 'en' ? '<span class="offer__lang">Englisch</span>' : ''}
      ${o.wettbewerb && SELEKTIV_LABEL[o.wettbewerb] ? `<span class="offer__sel offer__sel--${o.wettbewerb === 'hoch' ? 'hoch' : 'sehr-hoch'}">${SELEKTIV_LABEL[o.wettbewerb]}</span>` : ''}
      ${fit ? `<span class="offer__fit offer__fit--${fit.status}">${FIT_LABEL[fit.status]}</span>` : ''}
    </div>
    <h4 class="offer__name">${esc(o.name)}</h4>
    <p class="offer__by">${esc(o.anbieter)}</p>
    <dl class="offer__meta">
      ${place ? `<div><dt>Ort</dt><dd>${esc(place)}</dd></div>` : ''}
      <div><dt>Kosten</dt><dd>${esc(cost)}</dd></div>
      <div><dt>Frist</dt><dd class="${past ? 'is-past' : ''}">${esc(frist)}</dd></div>
      ${o.studiengaenge?.length ? `<div><dt>Studium</dt><dd>${esc(o.studiengaenge.slice(0, 3).join(', '))}${o.studiengaenge.length > 3 ? ' und mehr' : ''}</dd></div>` : ''}
      ${o.zulassung ? `<div><dt>Zulassung</dt><dd>${esc(o.zulassung)}</dd></div>` : ''}
      ${fit && o.richtwerte?.hinweis ? `<div><dt>Richtwert</dt><dd>${esc(o.richtwerte.hinweis)}</dd></div>` : ''}
    </dl>
    ${o.wettbewerb === 'sehr hoch' ? '<p class="offer__hint offer__hint--fit">Für internationale Bewerber besonders schwierig</p>' : ''}
    ${fit?.pflicht.map((x) => `<p class="offer__hint offer__hint--fit">${esc(x)}</p>`).join('') ?? ''}
    <p class="offer__text">${esc(o.kurzbeschreibung)}</p>
    ${o.kosten_pro_jahr_eur === null && o.kosten_hinweis ? `<p class="offer__hint">${esc(o.kosten_hinweis)}</p>` : ''}
    ${o.quelle_qualitaet === 'C' ? '<p class="offer__hint">Bitte auf der Karriereseite des Unternehmens prüfen.</p>' : ''}
    <div class="offer__foot">
      <span>Zuletzt geprüft am ${esc(formatDate(o.zuletzt_geprueft))}</span>
      <span class="offer__btns">${saveButton(o, saved)}<a class="btn btn--quiet btn--small" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">Mehr erfahren<span class="btn__arrow" aria-hidden="true">→</span></a></span>
    </div>
  </article>`;
}

// ---------- world map (Studium mode, src/app/map.ts, loaded on demand) ----------
const UNIS = OFFERS.filter((o) => o.typ === 'hochschule' || o.typ === 'studiengang');
let liveMap: { handle: MapHandle | null; wrap: HTMLElement } | null = null;

/** map with a collapse toggle; open on desktop, collapsed on phones. Returns the map once it is shown. */
function attachMap(slot: HTMLElement, highlight: string[] | null, forceOpen = false): Promise<MapHandle | null> {
  // one live map: the older one goes away
  if (liveMap) {
    liveMap.handle?.destroy();
    liveMap.wrap.remove();
    liveMap = null;
  }
  const phone = window.matchMedia('(max-width: 640px)').matches && !forceOpen;
  const wrap = document.createElement('div');
  wrap.className = 'mapwrap';
  wrap.innerHTML = `
    <button type="button" class="btn btn--quiet btn--small mapwrap__toggle" aria-expanded="${!phone}">${phone ? 'Karte anzeigen' : 'Karte ausblenden'}</button>
    <div class="mapwrap__map" ${phone ? 'hidden' : ''}></div>
    <div class="mapwrap__picked" aria-live="polite"></div>`;
  slot.append(wrap);
  // tracked from the start, also while still collapsed, so a newer map replaces it
  const entry: { handle: MapHandle | null; wrap: HTMLElement } = { handle: null, wrap };
  liveMap = entry;
  const toggle = wrap.querySelector<HTMLButtonElement>('.mapwrap__toggle')!;
  const box = wrap.querySelector<HTMLElement>('.mapwrap__map')!;
  const picked = wrap.querySelector<HTMLElement>('.mapwrap__picked')!;
  let handle: MapHandle | null = null;
  let resolve: (m: MapHandle | null) => void = () => {};
  const ready = new Promise<MapHandle | null>((r) => (resolve = r));

  const onSelect = (o: Offer) => {
    picked.innerHTML = `${card(o, false, fitProfile)}<button type="button" class="btn btn--solid btn--small mapwrap__ask">Dazu fragen</button>`;
    picked.querySelector<HTMLButtonElement>('.mapwrap__ask')!.addEventListener('click', () => {
      input.value = `Erzähl mir mehr über ${o.name}`;
      autosize();
      input.focus();
    });
    picked.querySelector<HTMLButtonElement>('[data-save]')?.addEventListener('click', () => toggleSaved(o.id));
    picked.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  const show = async () => {
    if (handle) return;
    const { mountMap } = await import('./map');
    if (!wrap.isConnected) return resolve(null);
    handle = mountMap(box, UNIS, { onSelect });
    entry.handle = handle;
    if (highlight?.length) handle.highlight(highlight);
    resolve(handle);
  };
  toggle.addEventListener('click', () => {
    const open = box.hidden;
    box.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Karte ausblenden' : 'Karte anzeigen';
    if (open) show();
  });
  if (!phone) show();
  return ready;
}

/** [[KARTE: ...]] without cards ("Wo liegt ...?"): only the map with the highlighted pins */
function renderMapOnly(after: HTMLElement, ids: string[]) {
  if (liveRecs) liveRecs.remove();
  const slot = document.createElement('div');
  slot.className = 'recs recs--map';
  liveRecs = slot;
  after.append(slot);
  // asked for on purpose ("Wo liegt ...?"), so it opens on phones too
  attachMap(slot, ids, true);
}

// ---------- talking to the coach ----------
async function ask(messages: Msg[], onText: (raw: string) => void, mode: Mode = state.mode): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code,
      mode,
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
  // the reply belongs to the tab it was asked in
  const mode = state.mode;
  const msgs = chat();
  msgs.push({ role: 'user', content: text, hidden: opts.hidden, ...(opts.dateien?.length ? { dateien: opts.dateien } : {}) });
  if (!opts.hidden) bubble('user', opts.dateien?.length && text === FILE_ONLY ? '' : format(text), opts.dateien);
  const el = bubble('assistant', '');
  const body = el.querySelector<HTMLElement>('.msg__body')!;
  // calm typing dots until the first words arrive
  const status = document.createElement('div');
  status.className = 'msg__status';
  status.innerHTML = '<span class="typing" role="status"><i></i><i></i><i></i><span class="sr-only">Pathfinder schreibt</span></span>';
  body.before(status);
  const dropStatus = () => status.remove();
  el.classList.add('is-streaming');
  scrollDown(true);
  const type = typer((t) => {
    const html = format(t);
    if (html) {
      dropStatus();
      body.innerHTML = html;
    }
  });
  try {
    const raw = await ask(msgs, (r) => type.push(visibleText(r)), mode);
    await type.finish();
    msgs.push({ role: 'assistant', content: raw });
    const parsed = parseMarkers(raw);
    if (parsed.profile) state.profile = { ...state.profile, ...parsed.profile };
    if (parsed.recommendation) {
      state.profile.felder = [...new Set([...((state.profile.felder as string[]) ?? []), ...parsed.recommendation.felder])];
      if (parsed.recommendation.stufe) state.profile.stufe = parsed.recommendation.stufe;
    }
    save();
    body.innerHTML = format(parsed.text);
    el.classList.remove('is-streaming');
    dropStatus();
    renderSources(body, parsed.sources);
    renderDeadlineCards(el, parsed.deadlines);
    const withMap = state.mode === 'studium' || Boolean(parsed.map);
    if (parsed.recommendation) renderRecommendations(el, parsed.recommendation, withMap ? { map: true, highlight: parsed.map } : {});
    else if (parsed.map) renderMapOnly(el, parsed.map);
    renderActions(el, parsed.options, parsed.buttons, parsed.followups);
    updateMentorSlot();
  } catch (e) {
    type.stop();
    msgs.pop(); // the student can send it again
    el.classList.remove('is-streaming');
    el.classList.add('msg--error');
    dropStatus();
    body.innerHTML = `<p>${esc((e as Error).message)}</p><button class="btn btn--quiet btn--small msg__retry" type="button">Erneut versuchen</button>`;
    body.querySelector('.msg__retry')!.addEventListener('click', () => {
      if (busy) return;
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
    await prepareMentorDialog();
    return new Promise<SlideResult>((resolve, reject) => (mentorOutcome = { resolve, reject }));
  },
});
$<HTMLElement>('[data-mentor-slider]').append(slider.el);

/** the AI writes a short summary, then the existing request form opens (slider and dashboard) */
async function prepareMentorDialog() {
    busy = true;
    let summary = '';
    try {
      const raw = await ask([...chat(), { role: 'user', content: MENTOR }], () => {});
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
}

dialog.addEventListener('close', () => {
  const outcome = mentorOutcome;
  mentorOutcome = null;
  // opened from the dashboard: no slider waiting, show its done state directly
  if (!outcome) return void (state.mentorSent && slider.markDone(false));
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
  if (!$<HTMLElement>('[data-screen="chat"]').hidden) setNav(next === 'mentor' ? 'mentor' : 'ki');
  views.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === next)));
  const mentor = next === 'mentor';
  chatSection.classList.toggle('is-mentor', mentor);
  mentorChat.hidden = !mentor;
  log.hidden = mentor;
  if (mentor) welcome.hidden = true;
  else showWelcome(MODE_LIST.every((m) => !hasReply(state.chats[m])));
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
      // the profile goes along as background for the mentor; no AI and no AI chat history
      body: JSON.stringify({ code, aktion: 'senden', text, dateien: files.map((f) => f.id), profil: state.profile }),
    });
    if (!res.ok) throw new Error();
    mentorMessages = (await res.json()).thread.nachrichten;
    renderMentor();
    if (!state.mentorThread) {
      // the first message from the dashboard started the direct chat
      state.mentorThread = true;
      state.mentorSent = true;
      save();
      slider.markDone(false);
      openMentorThread(false);
    }
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
    for (const m of MODE_LIST.flatMap((k) => state.chats[k])) m.dateien?.forEach((f) => f.id === id && (f.geloescht = true));
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
    const vorname = String((await res.json().catch(() => ({}))).vorname ?? '');
    code = value;
    loginName = vorname;
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

let loginName = '';
/** after login: load this student's data and show the dashboard */
function enterChat() {
  state = freshState();
  load();
  loadFit();
  if (loginName) state.name = loginName;
  loginName = '';
  save();
  showDashboard();
  // logged in before names were returned: ask once, quietly
  if (state.name === undefined) void fetchName();
  void loadPhoto();
}
async function fetchName() {
  const forCode = code;
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!res.ok || forCode !== code) return;
    state.name = String((await res.json()).vorname ?? '');
    save();
    if (state.name && !dashRoot.hidden) showDashboard();
  } catch {
    /* offline: greeting without a name */
  }
}

const dashRoot = $<HTMLElement>('[data-dash]');
const dashTicker = $<HTMLElement>('[data-dash-ticker]');
function showDashboard(to: 'top' | 'fristen' = 'top') {
  if (busy) return;
  show('dashboard');
  renderTicker(dashTicker);
  renderDashboard(dashRoot, {
    name: state.name ?? '',
    felder: Array.isArray(state.profile.felder) ? (state.profile.felder as string[]) : [],
    saved: state.saved,
    ask: (q) => openChat(q),
    openMentor: () => openMentor(),
    unsave: (id) => saveItem(id, false),
  });
  showUser();
  if (to === 'fristen') {
    const sec = dashRoot.querySelector<HTMLElement>('#fristen');
    sec?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' });
    sec?.focus({ preventScroll: true });
    setNav('fristen');
  } else {
    window.scrollTo(0, 0);
    setNav('start');
  }
}

/** the chat with the open tab, exactly as it was left; a question from the dashboard is sent right away */
function openChat(question = '') {
  if (busy) return;
  show('chat');
  setMode(state.mode);
  renderAll();
  if (state.mentorSent) slider.markDone(false);
  else slider.reset();
  if (state.mentorThread) openMentorThread(false);
  else closeMentorThread();
  if (view === 'mentor') setView('coach');
  openTab(state.mode, !question);
  setNav('ki');
  if (question) {
    showWelcome(false);
    send(question);
  }
}

/** "Mentor" on the dashboard: the direct chat with a person, no AI. The first message starts it. */
function openMentor() {
  if (busy) return;
  openChat();
  if (state.mentorThread) openMentorThread(false);
  $<HTMLElement>('[data-mentor-status]').textContent = state.mentorThread
    ? 'Ein Mensch ist informiert. Eine Antwort kann etwas dauern.'
    : 'Hier schreibst du direkt mit deinem Mentor. Es antwortet ein Mensch, keine KI, eine Antwort kann etwas dauern. Dein Mentor sieht dein Profil (zum Beispiel Klasse, Interessen und Ziele), deine KI-Chats nicht.';
  setView('mentor');
  input.focus({ preventScroll: true });
}

// ---------- main navigation (header and the sheet on phones) ----------
type NavKey = 'start' | 'fristen' | 'ki' | 'mentor';
function setNav(key: NavKey) {
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) => {
    if (b.dataset.nav === key) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}
const sheet = $<HTMLDialogElement>('[data-sheet]');
document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) =>
  b.addEventListener('click', () => {
    if (sheet.open) sheet.close();
    const key = b.dataset.nav as NavKey;
    if (key === 'start') showDashboard();
    else if (key === 'fristen') showDashboard('fristen');
    else if (key === 'ki') openChat();
    else openMentor();
  }),
);
$<HTMLButtonElement>('[data-sheet-open]').addEventListener('click', () => sheet.showModal());
$<HTMLButtonElement>('[data-sheet-close]').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => e.target === sheet && sheet.close());
sheet.querySelectorAll<HTMLButtonElement>('[data-sheet-action]').forEach((b) =>
  b.addEventListener('click', () => {
    sheet.close();
    document.querySelector<HTMLButtonElement>(`.menu [data-action="${b.dataset.sheetAction}"]`)?.click();
  }),
);
// ---------- profile photo (src/app/profile-photo.ts, stored per code by /api/profilbild) ----------
let photo: string | null = null;
async function photoApi<T>(body: object): Promise<T> {
  const res = await fetch('/api/profilbild', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Das hat nicht geklappt. Bitte versuche es noch einmal.');
  return data as T;
}
async function loadPhoto() {
  const forCode = code;
  try {
    const { bild } = await photoApi<{ bild: string | null }>({ aktion: 'holen' });
    if (forCode !== code) return;
    photo = typeof bild === 'string' && /^data:image\/(jpeg|webp);base64,/.test(bild) ? bild : null;
    showUser();
  } catch {
    /* offline: the initials stay */
  }
}
$<HTMLButtonElement>('[data-action="profilbild"]').addEventListener('click', () => {
  (document.querySelector('.menu') as HTMLDetailsElement | null)?.removeAttribute('open');
  openPhotoDialog({
    current: photo,
    save: async (bild) => void (await photoApi({ aktion: 'speichern', bild })),
    remove: async () => void (await photoApi({ aktion: 'loeschen' })),
    onChange: (bild) => {
      photo = bild;
      showUser();
    },
  });
});

/** initial and name in the user menu */
function showUser() {
  const name = (state.name ?? '').trim();
  const avatar = $<HTMLElement>('[data-user-initial]');
  // the photo in the same circle, otherwise the initial as before
  if (photo) avatar.innerHTML = `<img src="${photo}" alt="" />`;
  else avatar.textContent = (name[0] ?? 'P').toUpperCase();
  const label = $<HTMLElement>('[data-user-name]');
  label.textContent = name ? `Angemeldet als ${name}` : '';
  label.hidden = !name;
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
  photo = null;
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
$<HTMLButtonElement>('[data-action="delete"]').addEventListener('click', async () => {
  if (!confirm('Profil, Verlauf, Noten, gemerkte Angebote und dein Profilbild löschen?')) return;
  // the photo is on the server: delete it there too (before logout, while the code is known)
  try {
    await photoApi({ aktion: 'loeschen' });
  } catch {
    if (!confirm('Dein Profilbild konnte gerade nicht gelöscht werden. Trotzdem fortfahren? Du kannst es später unter Profilbild löschen.')) return;
  }
  try {
    localStorage.removeItem(storeKey());
    localStorage.removeItem(fitKey());
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
// the loading screen in app.html waits for this (and for the fonts)
requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('pf-ready'))));
window.addEventListener('hashchange', () => {
  if (!code) show(location.hash === '#zugang' ? 'register' : 'login');
});
