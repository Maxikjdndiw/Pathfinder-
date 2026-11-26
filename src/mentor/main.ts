/**
 * The mentor area (served only at /m/<MENTOR_PFAD>): Übersicht, an inbox for the direct chats
 * with students, and the self-requested accesses. Every call goes to /api/mentor-admin with the
 * password in a header; the server checks it each time. The password is kept for this browser
 * tab only (sessionStorage).
 *
 * Speed: the list is loaded without messages; an opened chat loads its last 50 messages
 * ("Ältere laden" for more); polling is light (open chat every 5 s, list every 10 s, paused while
 * the tab is hidden); replies show at once and are confirmed in the background; only what
 * changed is drawn again.
 */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../app/app.css'; // shared forms and [hidden]
import './mentor.css';

interface ChatRow {
  code: string;
  vorname: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  aktualisiert: string;
  anzahl: number;
  letzte: string;
  letzteVon: 'schueler' | 'mentor' | null;
  quelle: 'anfrage' | 'tab';
  zusammenfassung: string;
  ungelesen: number;
}
interface Message {
  von: 'schueler' | 'mentor';
  text: string;
  zeit: string;
  dateien?: { id: string; name: string; type: string; size: number }[];
}
interface Head {
  code: string;
  vorname: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  zusammenfassung: string;
  profil: Record<string, unknown> | null;
  email: string | null;
  quelle: 'anfrage' | 'tab';
}
interface Access {
  code: string;
  vorname: string;
  erstellt: string;
  zuletztBenutzt: string | null;
  gesperrt: boolean;
}
interface Overview {
  kpi: { gesamt: number; heute: number; woche: number; aktiv: number; ungelesen: number };
  tage: { tag: string; anmeldungen: number; logins: number }[];
  zuletzt: { code: string; vorname: string | null; letzter: string; erst: string }[];
}

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dayKey = (d: Date) => d.toLocaleDateString('sv-SE');
/** "14:05" today, "gestern 14:05", else "3. Dez., 14:05" */
function when(iso: string | null): string {
  if (!iso) return 'noch nie';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  if (dayKey(d) === dayKey(today)) return time;
  if (dayKey(d) === dayKey(new Date(today.getTime() - 86_400_000))) return `gestern ${time}`;
  return `${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}, ${time}`;
}
const hidden = () => document.hidden;

const KEY = 'pf-mentor:pw';
let password = '';
try {
  password = sessionStorage.getItem(KEY) ?? '';
} catch {
  password = '';
}

async function api<T>(body: object): Promise<T> {
  const res = await fetch('/api/mentor-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mentor-passwort': password },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    logout();
    throw new Error(data.error ?? 'Falsches Passwort.');
  }
  if (!res.ok) throw new Error(data.error ?? 'Das hat nicht geklappt.');
  return data as T;
}

// ---------- login ----------
const loginBox = $<HTMLElement>('[data-login]');
const app = $<HTMLElement>('[data-app]');
const logoutBtn = $<HTMLButtonElement>('[data-logout]');
const tabs = $<HTMLElement>('[data-tabs]');
let listTimer = 0;
let chatTimer = 0;

$<HTMLFormElement>('[data-login-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget as HTMLFormElement;
  const err = $<HTMLElement>('[data-login-error]');
  err.textContent = '';
  password = (form.elements.namedItem('passwort') as HTMLInputElement).value;
  try {
    await loadList();
    try {
      sessionStorage.setItem(KEY, password);
    } catch {
      /* stays for this page view only */
    }
    form.reset();
    start();
  } catch (x) {
    err.textContent = (x as Error).message;
  }
});

function start() {
  loginBox.hidden = true;
  app.hidden = false;
  tabs.hidden = false;
  logoutBtn.hidden = false;
  window.clearInterval(listTimer);
  listTimer = window.setInterval(() => !hidden() && loadList().catch(() => {}), 10_000);
}

function logout() {
  password = '';
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  window.clearInterval(listTimer);
  window.clearInterval(chatTimer);
  app.hidden = true;
  tabs.hidden = true;
  logoutBtn.hidden = true;
  loginBox.hidden = false;
}
logoutBtn.addEventListener('click', logout);

// back to a visible tab: catch up at once
document.addEventListener('visibilitychange', () => {
  if (hidden() || !password || app.hidden) return;
  loadList().catch(() => {});
  if (current) pollChat();
});

// ---------- tabs ----------
let tab = 'chats';
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab!;
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === b)));
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    if (tab === 'uebersicht') loadOverview().catch(() => {});
    if (tab === 'zugaenge') loadAccess().catch(() => {});
  }),
);

// ---------- chat list ----------
const list = $<HTMLUListElement>('[data-threads]');
const detail = $<HTMLElement>('[data-detail]');
const empty = $<HTMLElement>('[data-detail-empty]');
const search = $<HTMLInputElement>('[data-search]');
let rows: ChatRow[] = [];
let listSig = '';
const filters = new Set<string>();
let textHits = new Set<string>();

async function loadList() {
  const data = await api<{ chats: ChatRow[] }>({ aktion: 'liste' });
  // the open chat counts as read here, its messages are on screen
  rows = data.chats.map((r) => (current && r.code === current.head.code ? { ...r, ungelesen: 0 } : r));
  const sig = JSON.stringify(rows);
  if (sig === listSig) return;
  listSig = sig;
  const unread = rows.reduce((n, r) => n + r.ungelesen, 0);
  $<HTMLElement>('[data-count-unread]').textContent = unread ? String(unread) : '';
  renderList();
}

function visibleRows(): ChatRow[] {
  const q = search.value.trim().toLowerCase();
  const now = Date.now();
  const today = dayKey(new Date());
  return rows.filter((r) => {
    if (filters.has('ungelesen') && !r.ungelesen) return false;
    if (filters.has('heute') && dayKey(new Date(r.aktualisiert)) !== today) return false;
    if (filters.has('woche') && now - Date.parse(r.aktualisiert) > 7 * 86_400_000) return false;
    if (filters.has('tab') && r.quelle !== 'tab') return false;
    if (!q) return true;
    return [r.vorname ?? '', r.code, r.letzte, r.zusammenfassung].some((v) => v.toLowerCase().includes(q)) || textHits.has(r.code);
  });
}

function renderList() {
  const shown = visibleRows();
  list.innerHTML = shown.length
    ? shown
        .map(
          (r) => `<li><button type="button" class="mp-item${current?.head.code === r.code ? ' is-current' : ''}${r.ungelesen ? ' is-unread' : ''}" data-code="${esc(r.code)}">
            <span class="mp-item__top"><strong>${esc(r.vorname ?? 'Ohne Namen')}</strong><span class="mp-item__time">${when(r.aktualisiert)}</span></span>
            <span class="mp-item__text">${r.letzteVon === 'mentor' ? '<span class="mp-item__you">Du: </span>' : ''}${esc(r.letzte || r.zusammenfassung || 'Noch keine Nachricht')}</span>
            <span class="mp-item__meta"><span class="mp-mono">${esc(r.code)}</span>${r.quelle === 'tab' ? '<span class="mp-tag mp-tag--tab">Tab</span>' : ''}${r.status === 'erledigt' ? '<span class="mp-tag">erledigt</span>' : ''}${r.ungelesen ? `<span class="mp-badge" aria-label="${r.ungelesen} ungelesen">${r.ungelesen}</span>` : ''}</span>
          </button></li>`,
        )
        .join('')
    : `<li class="mp-empty">${rows.length ? 'Keine Chats für diese Suche oder diesen Filter.' : 'Noch keine Chats.'}</li>`;
}
list.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-code]');
  if (b) openChat(b.dataset.code!).catch(() => {});
});
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    const on = !filters.has(b.dataset.filter!);
    if (on) filters.add(b.dataset.filter!);
    else filters.delete(b.dataset.filter!);
    b.setAttribute('aria-pressed', String(on));
    renderList();
  }),
);
// search: names, codes and the last message at once; message text through the server, after a short pause
let searchTimer = 0;
search.addEventListener('input', () => {
  renderList();
  window.clearTimeout(searchTimer);
  const q = search.value.trim();
  if (q.length < 3) {
    textHits = new Set();
    return;
  }
  searchTimer = window.setTimeout(async () => {
    try {
      const { codes } = await api<{ codes: string[] }>({ aktion: 'suche', q });
      if (search.value.trim() !== q) return;
      textHits = new Set(codes);
      renderList();
    } catch {
      /* the local search still works */
    }
  }, 350);
});

// ---------- the open chat ----------
const thread = $<HTMLElement>('[data-detail-thread]');
let current: { head: Head; msgs: Message[]; start: number; total: number } | null = null;
let sending = 0;

function msgHtml(m: Message, pending = false): string {
  const name = m.von === 'mentor' ? 'Du' : esc(current?.head.vorname ?? 'Schüler');
  const files = m.dateien?.length
    ? `<ul class="mp-files">${m.dateien
        .map(
          (f) => `<li class="mp-file"><button type="button" class="mp-file__name" data-file="${esc(f.id)}" data-name="${esc(f.name)}">${esc(f.name)}</button><span class="mp-file__size">${Math.max(1, Math.round(f.size / 1024))} KB</span><button type="button" class="mp-file__del" data-file-del="${esc(f.id)}" aria-label="${esc(f.name)} löschen">×</button></li>`,
        )
        .join('')}</ul>`
    : '';
  return `<div class="mp-msg mp-msg--${m.von}${pending ? ' is-pending' : ''}"><div class="mp-msg__bubble">${files}${m.text ? `<p class="mp-msg__text">${esc(m.text)}</p>` : ''}</div><p class="mp-msg__who">${name} · <span data-when>${pending ? 'wird gesendet' : when(m.zeit)}</span></p></div>`;
}
const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
const toBottom = () => (thread.scrollTop = thread.scrollHeight);

async function openChat(code: string) {
  window.clearInterval(chatTimer);
  const data = await api<{ kopf: Head; nachrichten: Message[]; start: number; total: number }>({ aktion: 'verlauf', code });
  current = { head: data.kopf, msgs: data.nachrichten, start: data.start, total: data.total };
  renderHead();
  thread.innerHTML = (current.start > 0 ? '<button type="button" class="mp-older" data-older>Ältere laden</button>' : '') +
    (current.msgs.length ? current.msgs.map((m) => msgHtml(m)).join('') : '<p class="mp-empty" data-none>Noch keine Nachrichten. Schreib die erste Antwort.</p>');
  detail.hidden = false;
  empty.hidden = true;
  document.body.classList.add('has-detail');
  toBottom();
  // read now: clear its badge without reloading the list
  rows = rows.map((r) => (r.code === code ? { ...r, ungelesen: 0 } : r));
  const unread = rows.reduce((n, r) => n + r.ungelesen, 0);
  $<HTMLElement>('[data-count-unread]').textContent = unread ? String(unread) : '';
  renderList();
  chatTimer = window.setInterval(() => !hidden() && pollChat(), 5_000);
  $<HTMLTextAreaElement>('#reply').focus({ preventScroll: true });
}

function renderHead() {
  if (!current) return;
  const t = current.head;
  $<HTMLElement>('[data-detail-name]').textContent = t.vorname ?? 'Ohne Namen';
  $<HTMLElement>('[data-detail-meta]').textContent = `${t.code} · seit ${when(t.erstellt)} · ${t.quelle === 'tab' ? 'direkt über Mentor im Dashboard' : 'Anfrage mit KI-Zusammenfassung'} · ${t.email ? 'möchte per E-Mail benachrichtigt werden' : 'keine E-Mail-Benachrichtigung'}`;
  const p = t.profil ?? {};
  const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(', ') : '');
  const facts = [
    p.klasse ? `Klasse ${p.klasse}` : '',
    p.bundesland,
    list(p.felder) ? `Felder: ${list(p.felder)}` : '',
    list(p.interessen) ? `Interessen: ${list(p.interessen)}` : '',
    list(p.berufe) ? `Berufe: ${list(p.berufe)}` : '',
    p.note ? `Note: ${p.note}` : '',
    p.cv_status ? `Lebenslauf: ${p.cv_status}` : '',
    p.ziel ? `Ziel: ${p.ziel}` : '',
  ].filter(Boolean) as string[];
  $<HTMLElement>('[data-detail-profile]').textContent = facts.join(' · ') || 'Kein Profil gespeichert.';
  $<HTMLElement>('[data-detail-summary]').textContent = t.zusammenfassung || 'Keine, der Chat wurde direkt gestartet.';
  $<HTMLButtonElement>('[data-status-toggle]').textContent = t.status === 'offen' ? 'Als erledigt markieren' : 'Wieder öffnen';
}

/** new messages of the open chat only; nothing is drawn twice */
async function pollChat() {
  if (!current || sending) return;
  const code = current.head.code;
  try {
    const data = await api<{ nachrichten: Message[]; total: number; status: Head['status'] }>({ aktion: 'neu', code, seit: current.total });
    if (!current || current.head.code !== code || sending) return;
    if (data.status !== current.head.status) {
      current.head.status = data.status;
      renderHead();
    }
    if (!data.nachrichten.length) return;
    const stick = nearBottom();
    thread.querySelector('[data-none]')?.remove();
    thread.insertAdjacentHTML('beforeend', data.nachrichten.map((m) => msgHtml(m)).join(''));
    current.msgs.push(...data.nachrichten);
    current.total = data.total;
    if (stick) toBottom();
  } catch {
    /* the next round tries again */
  }
}

// older messages: 50 more, the view stays where it was
thread.addEventListener('click', async (e) => {
  const older = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-older]');
  if (!older || !current) return;
  older.disabled = true;
  try {
    const data = await api<{ nachrichten: Message[]; start: number }>({ aktion: 'verlauf', code: current.head.code, vor: current.start });
    const before = thread.scrollHeight;
    older.remove();
    thread.insertAdjacentHTML('afterbegin', (data.start > 0 ? '<button type="button" class="mp-older" data-older>Ältere laden</button>' : '') + data.nachrichten.map((m) => msgHtml(m)).join(''));
    current.msgs.unshift(...data.nachrichten);
    current.start = data.start;
    thread.scrollTop += thread.scrollHeight - before;
  } catch {
    older.disabled = false;
  }
});

$<HTMLButtonElement>('[data-status-toggle]').addEventListener('click', async () => {
  if (!current) return;
  const status = current.head.status === 'offen' ? 'erledigt' : 'offen';
  current.head.status = status;
  renderHead();
  rows = rows.map((r) => (r.code === current!.head.code ? { ...r, status } : r));
  renderList();
  await api({ aktion: 'status', code: current.head.code, status }).catch(() => {});
});

$<HTMLButtonElement>('[data-back]').addEventListener('click', () => {
  current = null;
  window.clearInterval(chatTimer);
  detail.hidden = true;
  empty.hidden = false;
  document.body.classList.remove('has-detail');
  renderList();
});

// files in the thread: open (download through the password) or delete
thread.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLButtonElement>('[data-file]');
  const del = t.closest<HTMLButtonElement>('[data-file-del]');
  if (!current || (!open && !del)) return;
  if (del) {
    if (!confirm('Diese Datei löschen?')) return;
    await api({ aktion: 'datei-loeschen', code: current.head.code, id: del.dataset.fileDel }).catch(() => {});
    del.closest('.mp-file')?.classList.add('is-gone');
    return;
  }
  const res = await fetch('/api/mentor-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mentor-passwort': password },
    body: JSON.stringify({ aktion: 'datei', code: current.head.code, id: open!.dataset.file }),
  });
  if (!res.ok) return void open!.closest('.mp-file')?.classList.add('is-gone');
  const href = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href, download: open!.dataset.name ?? 'datei' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
});

// files the mentor sends back: uploaded into the student's mentor chat
let replyFiles: { id: string; name: string }[] = [];
const replyList = $<HTMLElement>('[data-reply-files]');
const replyInput = $<HTMLInputElement>('[data-reply-input]');
const renderReplyFiles = () =>
  (replyList.innerHTML = replyFiles.map((f) => `<li class="mp-file"><span class="mp-file__name">${esc(f.name)}</span></li>`).join(''));
$<HTMLButtonElement>('[data-reply-attach]').addEventListener('click', () => replyInput.click());
replyInput.addEventListener('change', async () => {
  const err = $<HTMLElement>('[data-reply-error]');
  err.textContent = '';
  for (const file of [...(replyInput.files ?? [])]) {
    if (!current || replyFiles.length >= 3) break;
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', 'x-mentor-passwort': password, 'x-code': current.head.code, 'x-ziel': 'mentor', 'x-dateiname': encodeURIComponent(file.name) },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.file) err.textContent = data.error ?? 'Das hat nicht geklappt.';
    else replyFiles.push({ id: data.file.id, name: data.file.name });
  }
  replyInput.value = '';
  renderReplyFiles();
});

// reply: shows at once, confirmed in the background
const reply = $<HTMLFormElement>('[data-reply]');
const area = $<HTMLTextAreaElement>('#reply');
const autosize = () => {
  area.style.height = 'auto';
  area.style.height = `${Math.min(area.scrollHeight, 200)}px`;
};
area.addEventListener('input', autosize);
area.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    reply.requestSubmit();
  }
});
reply.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const text = area.value.trim();
  const err = $<HTMLElement>('[data-reply-error]');
  err.textContent = '';
  if (!text && !replyFiles.length) return;
  const code = current.head.code;
  const files = replyFiles;
  const draft: Message = { von: 'mentor', text, zeit: new Date().toISOString() };
  thread.querySelector('[data-none]')?.remove();
  thread.insertAdjacentHTML('beforeend', msgHtml(draft, true));
  const el = thread.lastElementChild as HTMLElement;
  toBottom();
  area.value = '';
  autosize();
  replyFiles = [];
  renderReplyFiles();
  sending++;
  try {
    const data = await api<{ nachricht: Message; total: number }>({ aktion: 'antworten', code, text, dateien: files.map((f) => f.id) });
    if (current?.head.code === code) {
      el.outerHTML = msgHtml(data.nachricht);
      current.msgs.push(data.nachricht);
      current.total = data.total;
    }
    rows = rows.map((r) => (r.code === code ? { ...r, letzte: text || r.letzte, letzteVon: 'mentor' as const, aktualisiert: data.nachricht.zeit } : r)).sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert));
    renderList();
  } catch (x) {
    el.classList.add('is-failed');
    el.querySelector('[data-when]')!.textContent = 'nicht gesendet';
    if (!area.value) area.value = text;
    replyFiles = files;
    renderReplyFiles();
    err.textContent = (x as Error).message;
  } finally {
    sending--;
  }
});

// ---------- Übersicht ----------
async function loadOverview() {
  const o = await api<Overview>({ aktion: 'uebersicht' });
  const k = o.kpi;
  const cards: [string, number][] = [
    ['Anmeldungen gesamt', k.gesamt],
    ['Neu heute', k.heute],
    ['Neu in 7 Tagen', k.woche],
    ['Aktive Schüler, 7 Tage', k.aktiv],
    ['Ungelesene Nachrichten', k.ungelesen],
  ];
  $<HTMLElement>('[data-kpis]').innerHTML = cards
    .map(([label, n], i) => `<div class="mp-kpi" style="--i:${i}"><p class="mp-kpi__n">${n}</p><p class="mp-kpi__l">${label}</p></div>`)
    .join('');
  drawChart(o.tage);
  $<HTMLElement>('[data-recent]').innerHTML = o.zuletzt.length
    ? o.zuletzt
        .map((z) => `<li><span class="mp-recent__name">${esc(z.vorname ?? 'Fester Code')}</span><span class="mp-mono">${esc(z.code.replace(/^([A-Z0-9]{4})([A-Z0-9]{4})$/, '$1-$2'))}</span><span class="mp-recent__time">${when(z.letzter)}</span></li>`)
        .join('')
    : '<li class="mp-empty">Noch keine Logins erfasst. Logins werden ab jetzt gezählt.</li>';
}

/** two soft blue lines in inline SVG, with a tooltip on hover */
function drawChart(days: Overview['tage']) {
  const box = $<HTMLElement>('[data-chart]');
  // drawn at the real width, so text and lines keep their size
  const W = Math.max(300, Math.round(box.clientWidth || 720));
  const H = 220;
  const P = { l: 32, r: 12, t: 12, b: 26 };
  const max = Math.max(4, ...days.map((d) => Math.max(d.anmeldungen, d.logins)));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (days.length - 1);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const line = (key: 'anmeldungen' | 'logins') => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  const ticks = [0, Math.round(max / 2), max];
  const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="mp-svg" role="img" aria-label="Neue Anmeldungen und Logins der letzten 30 Tage">
      ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" class="mp-grid"/><text x="${P.l - 8}" y="${y(t) + 4}" class="mp-axis" text-anchor="end">${t}</text>`).join('')}
      ${[0, 10, 20, 29].map((i) => `<text x="${x(i)}" y="${H - 6}" class="mp-axis" text-anchor="${i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}">${label(days[i].tag)}</text>`).join('')}
      <path d="${line('logins')}" class="mp-line mp-line--b"/>
      <path d="${line('anmeldungen')}" class="mp-line mp-line--a"/>
      <line class="mp-guide" y1="${P.t}" y2="${H - P.b}" x1="0" x2="0" hidden/>
      <circle class="mp-pt mp-pt--b" r="4" hidden/><circle class="mp-pt mp-pt--a" r="4" hidden/>
      <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" data-hit/>
    </svg><div class="mp-tip" hidden></div>
    <table class="sr-only"><caption>Pro Tag</caption><tr><th>Tag</th><th>Anmeldungen</th><th>Logins</th></tr>${days.map((d) => `<tr><td>${d.tag}</td><td>${d.anmeldungen}</td><td>${d.logins}</td></tr>`).join('')}</table>`;
  const svg = box.querySelector('svg')!;
  const guide = svg.querySelector<SVGLineElement>('.mp-guide')!;
  const pa = svg.querySelector<SVGCircleElement>('.mp-pt--a')!;
  const pb = svg.querySelector<SVGCircleElement>('.mp-pt--b')!;
  const tip = box.querySelector<HTMLElement>('.mp-tip')!;
  const hit = svg.querySelector<SVGRectElement>('[data-hit]')!;
  const show = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((vx - P.l) / (W - P.l - P.r)) * (days.length - 1))));
    const d = days[i];
    for (const [el, v] of [[pa, d.anmeldungen], [pb, d.logins]] as const) {
      el.setAttribute('cx', String(x(i)));
      el.setAttribute('cy', String(y(v)));
      el.removeAttribute('hidden');
    }
    guide.setAttribute('x1', String(x(i)));
    guide.setAttribute('x2', String(x(i)));
    guide.removeAttribute('hidden');
    tip.innerHTML = `<strong>${label(d.tag)}</strong><span><i class="mp-legend__dot mp-legend__dot--a"></i>${d.anmeldungen} neue Anmeldungen</span><span><i class="mp-legend__dot mp-legend__dot--b"></i>${d.logins} Logins</span>`;
    tip.hidden = false;
    const left = (x(i) / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 90), r.width - 90)}px`;
  };
  const hide = () => {
    tip.hidden = true;
    for (const el of [guide, pa, pb]) el.setAttribute('hidden', '');
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

// ---------- accesses ----------
async function loadAccess() {
  const { zugaenge: rows, warteliste } = await api<{ zugaenge: Access[]; warteliste: number }>({ aktion: 'zugaenge' });
  $<HTMLElement>('[data-waitlist]').textContent = `${rows.length} selbst angeforderte Zugänge${warteliste ? `, ${warteliste} auf der Warteliste` : ''}. Codes aus PATHFINDER_ACCESS_CODES stehen nicht in dieser Liste.`;
  const body = $<HTMLElement>('[data-access]');
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) => `<tr class="${r.gesperrt ? 'is-blocked' : ''}"><td>${esc(r.vorname)}</td><td class="mp-mono">${esc(r.code)}</td><td>${when(r.erstellt)}</td><td>${when(r.zuletztBenutzt)}</td>
          <td><button type="button" class="mp-btn" data-block="${esc(r.code)}" data-on="${r.gesperrt ? '0' : '1'}">${r.gesperrt ? 'Entsperren' : 'Sperren'}</button></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="mp-empty">Noch keine Zugänge angefordert.</td></tr>';
  body.querySelectorAll<HTMLButtonElement>('[data-block]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await api({ aktion: 'sperren', code: b.dataset.block, gesperrt: b.dataset.on === '1' }).catch(() => {});
      await loadAccess().catch(() => {});
    }),
  );
}

// already signed in in this tab?
if (password) loadList().then(start, () => logout());
