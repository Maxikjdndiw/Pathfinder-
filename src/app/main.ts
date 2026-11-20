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
import {
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
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  /** technical messages (start of a mode) are sent but not shown */
  hidden?: boolean;
}
interface State {
  mode: Mode;
  profile: Record<string, unknown>;
  messages: Msg[];
  saved: string[];
}

const START = '[[SYSTEM: START]]';
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
function show(screen: 'login' | 'chat') {
  document.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => (el.hidden = el.dataset.screen !== screen));
  document.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => (el.hidden = el.dataset.when !== screen));
}

const log = $<HTMLElement>('[data-log]');
const input = $<HTMLTextAreaElement>('#chat-input');
const chatForm = $<HTMLFormElement>('[data-form="chat"]');
let busy = false;

function setMode(mode: Mode) {
  state.mode = mode;
  document.querySelectorAll<HTMLElement>('[data-step]').forEach((li) => {
    li.classList.toggle('is-current', li.dataset.step === mode);
    if (li.dataset.step === mode) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  // the mentor button belongs to the CV and internship parts, not to orientation
  $<HTMLElement>('[data-mentor-bar]').hidden = mode === 'orientierung';
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

function bubble(role: Msg['role'], html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `msg msg--${role === 'user' ? 'me' : 'coach'}`;
  el.innerHTML = `<div class="msg__body">${html}</div>`;
  log.appendChild(el);
  return el;
}

function renderAll() {
  log.innerHTML = '';
  const lastAssistant = state.messages.map((m) => m.role).lastIndexOf('assistant');
  state.messages.forEach((m, i) => {
    if (m.hidden) return;
    if (m.role === 'user') return void bubble('user', format(m.content));
    const parsed = parseMarkers(m.content);
    const el = bubble('assistant', format(parsed.text));
    if (parsed.recommendation) renderRecommendations(el, parsed.recommendation);
    if (i === lastAssistant) renderActions(el, parsed.options, parsed.buttons);
  });
  scrollDown();
}

function scrollDown() {
  requestAnimationFrame(() => log.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
}

/** Tappable options (several can be picked) and mode buttons, only under the latest reply. */
function renderActions(after: HTMLElement, options: string[], buttons: ModeButton[]) {
  if (!options.length && !buttons.length) return;
  const box = document.createElement('div');
  box.className = 'actions';
  if (options.length) {
    box.innerHTML = `<div class="chips" role="group" aria-label="Auswahl">${options
      .map((o) => `<button type="button" class="chip" aria-pressed="false" data-option="${esc(o)}">${esc(o)}</button>`)
      .join('')}</div><button type="button" class="btn btn--primary btn--small" data-send-options disabled>Auswahl senden</button>`;
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
    buttons.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${i === 0 ? 'btn--primary' : 'btn--outline'} btn--small`;
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
    <p class="recs__note">Aus unserer geprüften Liste. Fristen und Kosten ändern sich: Prüfe sie immer auf der offiziellen Seite.</p>
    <details class="recs__filters">
      <summary>Filter</summary>
      <div class="filter-grid">
        <label class="field"><span class="field__label">Land</span>
          <select class="input" data-f="land"><option value="alle">Alle</option><option value="de">Deutschland</option><option value="ausland">Ausland</option></select></label>
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
        ? 'Keine Angebote mit diesen Filtern. Lockere die Filter etwas.'
        : 'Für diese Felder haben wir noch keine geprüften Angebote. Wir ergänzen die Liste laufend.';
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
      ? 'Kosten unbekannt'
      : o.kosten_pro_jahr_eur === 0
        ? study ? 'Nur Semesterbeitrag' : 'Kostenlos'
        : `${formatEuro(o.kosten_pro_jahr_eur)} pro Jahr${o.kosten_label ? ` (${o.kosten_label})` : ''}`;
  const place = [o.ort, o.online ? 'online' : ''].filter(Boolean).join(', ');
  const frist = o.frist ? `${isPast(o.frist) ? 'Frist war' : 'Frist'}: ${formatDate(o.frist)}` : 'Frist: noch nicht bekannt';
  const saved = state.saved.includes(o.id);
  return `<article class="offer">
    <div class="offer__top"><span class="offer__typ">${TYP_LABEL[o.typ] ?? esc(o.typ)}</span>
      <button type="button" class="offer__save" data-save="${o.id}" aria-pressed="${saved}" aria-label="Merken: ${esc(o.name)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.4 1.1 4.8 2.9 1.4-1.8 2.8-2.9 4.8-2.9 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg></button></div>
    <h4 class="offer__name">${esc(o.name)}</h4>
    <p class="offer__by">${esc(o.anbieter)}${place ? ` · ${esc(place)}` : ''}</p>
    <p class="offer__text">${esc(o.kurzbeschreibung)}</p>
    <dl class="offer__meta">
      <div><dt>Kosten</dt><dd>${esc(cost)}</dd></div>
      ${o.zeitraum ? `<div><dt>Zeitraum</dt><dd>${esc(o.zeitraum)}</dd></div>` : ''}
      <div><dt>Frist</dt><dd class="${isPast(o.frist) ? 'is-past' : ''}">${esc(frist.replace(/^Frist( war)?: /, ''))}${isPast(o.frist) ? ' (abgelaufen)' : ''}</dd></div>
    </dl>
    <p class="offer__foot"><span>Zuletzt geprüft am ${esc(formatDate(o.zuletzt_geprueft))}</span>
      <a href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">Offizielle Seite<span aria-hidden="true"> →</span></a></p>
  </article>`;
}

// ---------- talking to the coach ----------
async function ask(messages: Msg[], onText: (raw: string) => void): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, mode: state.mode, profile: state.profile, messages: messages.map(({ role, content }) => ({ role, content })) }),
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

async function send(text: string, opts: { hidden?: boolean } = {}) {
  if (busy) return;
  busy = true;
  chatForm.classList.add('is-busy');
  log.querySelectorAll('.actions').forEach((a) => a.remove());
  state.messages.push({ role: 'user', content: text, hidden: opts.hidden });
  if (!opts.hidden) bubble('user', format(text));
  const el = bubble('assistant', '<p class="msg__typing" aria-label="Der Coach schreibt"><span></span><span></span><span></span></p>');
  scrollDown();
  try {
    const raw = await ask(state.messages, (r) => {
      el.querySelector('.msg__body')!.innerHTML = format(visibleText(r)) || el.querySelector('.msg__body')!.innerHTML;
    });
    state.messages.push({ role: 'assistant', content: raw });
    const parsed = parseMarkers(raw);
    if (parsed.profile) state.profile = { ...state.profile, ...parsed.profile };
    if (parsed.recommendation) {
      state.profile.felder = [...new Set([...((state.profile.felder as string[]) ?? []), ...parsed.recommendation.felder])];
      if (parsed.recommendation.stufe) state.profile.stufe = parsed.recommendation.stufe;
    }
    save();
    el.querySelector('.msg__body')!.innerHTML = format(parsed.text);
    if (parsed.recommendation) renderRecommendations(el, parsed.recommendation);
    renderActions(el, parsed.options, parsed.buttons);
  } catch (e) {
    state.messages.pop(); // the student can send it again
    el.classList.add('msg--error');
    el.querySelector('.msg__body')!.innerHTML = `<p>${esc((e as Error).message)}</p>`;
    if (!opts.hidden) input.value = text;
  } finally {
    busy = false;
    chatForm.classList.remove('is-busy');
    scrollDown();
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  autosize();
  send(text);
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
const dialog = $<HTMLDialogElement>('[data-mentor]');
const mentorForm = $<HTMLFormElement>('[data-form="mentor"]');
$<HTMLButtonElement>('[data-action="mentor"]').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  if (busy) return;
  busy = true;
  btn.disabled = true;
  btn.textContent = 'Zusammenfassung wird erstellt';
  let summary = '';
  try {
    const raw = await ask([...state.messages, { role: 'user', content: MENTOR }], () => {});
    summary = parseMarkers(raw).summary ?? visibleText(raw);
  } catch {
    summary = '';
  }
  busy = false;
  btn.disabled = false;
  btn.textContent = 'Mentor kontaktieren';
  mentorForm.reset();
  (mentorForm.elements.namedItem('zusammenfassung') as HTMLTextAreaElement).value = summary;
  (mentorForm.elements.namedItem('zugangscode') as HTMLInputElement).value = code;
  $<HTMLElement>('[data-mentor-error]').textContent = '';
  dialog.showModal();
});
$<HTMLButtonElement>('[data-action="mentor-close"]').addEventListener('click', () => dialog.close());
mentorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!mentorForm.reportValidity()) return;
  const body = new URLSearchParams(new FormData(mentorForm) as unknown as Record<string, string>).toString();
  try {
    const res = await fetch('/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error();
    dialog.close();
    bubble('assistant', '<p>Deine Anfrage ist angekommen. Eine Mentorin oder ein Mentor meldet sich per E-Mail bei dir.</p>');
    scrollDown();
  } catch {
    $<HTMLElement>('[data-mentor-error]').textContent = 'Das hat nicht geklappt. Versuch es bitte noch einmal.';
  }
});

// ---------- login, logout, delete ----------
const loginForm = $<HTMLFormElement>('[data-form="login"]');
const parentsBox = $<HTMLElement>('[data-parents]');
loginForm.addEventListener('change', () => {
  const under16 = (loginForm.elements.namedItem('alter') as RadioNodeList).value === 'unter16';
  parentsBox.hidden = !under16;
  (loginForm.elements.namedItem('eltern') as HTMLInputElement).required = under16;
});
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $<HTMLElement>('[data-error]');
  err.textContent = '';
  if (!loginForm.checkValidity()) {
    err.textContent = 'Bitte gib deinen Code ein und bestätige die Hinweise.';
    loginForm.reportValidity();
    return;
  }
  const value = (loginForm.elements.namedItem('code') as HTMLInputElement).value.trim().toUpperCase();
  const btn = loginForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  btn.disabled = true;
  try {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: value }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Das hat nicht geklappt.');
    code = value;
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch {
      /* stays logged in for this visit only */
    }
    enterChat();
  } catch (x) {
    err.textContent = (x as Error).message;
  } finally {
    btn.disabled = false;
  }
});

function enterChat() {
  state = { mode: 'orientierung', profile: {}, messages: [], saved: [] };
  load();
  show('chat');
  setMode(state.mode);
  renderAll();
  if (!state.messages.some((m) => m.role === 'assistant')) {
    state.messages = [];
    send(START, { hidden: true });
  }
  input.focus();
}

function logout() {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing stored */
  }
  code = '';
  log.innerHTML = '';
  loginForm.reset();
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
else show('login');
