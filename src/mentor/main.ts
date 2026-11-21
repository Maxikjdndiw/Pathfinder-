/**
 * /mentor: the mentor area. Open requests, the direct chat with each student, and the list
 * of self-requested accesses (block or unblock). Every call goes to /api/mentor-admin with
 * the password in a header; the server checks it each time. The password is kept for this
 * browser tab only (sessionStorage).
 */
import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../app/app.css'; // shared forms, buttons and [hidden]
import './mentor.css';

interface ThreadRow {
  code: string;
  vorname: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  aktualisiert: string;
  anzahl: number;
  ungelesen: boolean;
  zusammenfassung: string;
}
interface Message {
  von: 'schueler' | 'mentor';
  text: string;
  zeit: string;
  dateien?: { id: string; name: string; type: string; size: number }[];
}
interface Thread {
  code: string;
  vorname: string | null;
  zusammenfassung: string;
  profil: Record<string, unknown> | null;
  email: string | null;
  status: 'offen' | 'erledigt';
  erstellt: string;
  nachrichten: Message[];
}
interface Access {
  code: string;
  vorname: string;
  erstellt: string;
  zuletztBenutzt: string | null;
  gesperrt: boolean;
}

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'noch nie';

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
let listTimer = 0;
let detailTimer = 0;

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
  logoutBtn.hidden = false;
  window.clearInterval(listTimer);
  listTimer = window.setInterval(() => loadList().catch(() => {}), 15000);
}

function logout() {
  password = '';
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  window.clearInterval(listTimer);
  window.clearInterval(detailTimer);
  app.hidden = true;
  logoutBtn.hidden = true;
  loginBox.hidden = false;
}
logoutBtn.addEventListener('click', logout);

// ---------- tabs ----------
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
  }),
);

// ---------- requests ----------
const list = $<HTMLUListElement>('[data-threads]');
const detail = $<HTMLElement>('[data-detail]');
const empty = $<HTMLElement>('[data-detail-empty]');
let current: Thread | null = null;

async function loadList() {
  const data = await api<{ threads: ThreadRow[]; zugaenge: Access[]; warteliste: number }>({ aktion: 'liste' });
  const open = data.threads.filter((t) => t.status === 'offen').length;
  $<HTMLElement>('[data-count-open]').textContent = open ? String(open) : '';
  list.innerHTML = data.threads.length
    ? data.threads
        .map(
          (t) => `<li><button type="button" class="mp-item${current?.code === t.code ? ' is-current' : ''}" data-code="${esc(t.code)}">
            <span class="mp-item__top"><strong>${esc(t.vorname ?? 'Ohne Namen')}</strong>${t.ungelesen ? '<span class="mp-dot" aria-label="ungelesen"></span>' : ''}<span class="mp-pill mp-pill--${t.status}">${t.status}</span></span>
            <span class="mp-item__text">${esc(t.zusammenfassung || 'Keine Zusammenfassung')}</span>
            <span class="mp-item__meta">${esc(t.code)} · ${when(t.aktualisiert)} · ${t.anzahl} ${t.anzahl === 1 ? 'Nachricht' : 'Nachrichten'}</span>
          </button></li>`,
        )
        .join('')
    : '<li class="mp-empty">Noch keine Anfragen.</li>';
  list.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((b) => b.addEventListener('click', () => openThread(b.dataset.code!)));
  renderAccess(data.zugaenge, data.warteliste);
}

async function openThread(code: string) {
  const { thread } = await api<{ thread: Thread }>({ aktion: 'verlauf', code });
  current = thread;
  renderThread();
  detail.hidden = false;
  empty.hidden = true;
  document.body.classList.add('has-detail');
  window.clearInterval(detailTimer);
  // new student messages show up while the thread is open
  detailTimer = window.setInterval(async () => {
    if (!current || document.hidden) return;
    try {
      const { thread: t } = await api<{ thread: Thread }>({ aktion: 'verlauf', code: current.code });
      if (t.nachrichten.length !== current.nachrichten.length || t.status !== current.status) {
        current = t;
        renderThread();
      }
    } catch {
      /* the next round tries again */
    }
  }, 6000);
  loadList().catch(() => {});
}

function renderThread() {
  if (!current) return;
  const t = current;
  $<HTMLElement>('[data-detail-name]').textContent = t.vorname ?? 'Ohne Namen';
  $<HTMLElement>('[data-detail-meta]').textContent = `${t.code} · seit ${when(t.erstellt)} · ${t.email ? 'möchte per E-Mail benachrichtigt werden' : 'keine E-Mail-Benachrichtigung'}`;
  $<HTMLElement>('[data-detail-summary]').textContent = t.zusammenfassung || 'Keine Zusammenfassung';
  const p = t.profil ?? {};
  const facts = [p.klasse ? `Klasse ${p.klasse}` : '', p.bundesland, Array.isArray(p.felder) ? (p.felder as string[]).join(', ') : '', p.ziel].filter(Boolean);
  $<HTMLElement>('[data-detail-profile]').textContent = facts.join(' · ');
  const toggle = $<HTMLButtonElement>('[data-status-toggle]');
  toggle.textContent = t.status === 'offen' ? 'Als erledigt markieren' : 'Wieder öffnen';
  const thread = $<HTMLElement>('[data-detail-thread]');
  thread.innerHTML = t.nachrichten.length
    ? t.nachrichten
        .map(
          (m) => `<div class="mp-msg mp-msg--${m.von}"><p class="mp-msg__who">${m.von === 'mentor' ? 'Du' : esc(t.vorname ?? 'Schüler')} · ${when(m.zeit)}</p>${
            m.dateien?.length
              ? `<ul class="mp-files">${m.dateien
                  .map(
                    (f) => `<li class="mp-file"><button type="button" class="mp-file__name" data-file="${esc(f.id)}" data-name="${esc(f.name)}">${esc(f.name)}</button><span class="mp-file__size">${Math.max(1, Math.round(f.size / 1024))} KB</span><button type="button" class="mp-file__del" data-file-del="${esc(f.id)}" aria-label="${esc(f.name)} löschen">×</button></li>`,
                  )
                  .join('')}</ul>`
              : ''
          }${m.text ? `<p class="mp-msg__text">${esc(m.text)}</p>` : ''}</div>`,
        )
        .join('')
    : '<p class="mp-empty">Noch keine Nachrichten. Schreib die erste Antwort.</p>';
  thread.scrollTop = thread.scrollHeight;
}

$<HTMLButtonElement>('[data-status-toggle]').addEventListener('click', async () => {
  if (!current) return;
  const status = current.status === 'offen' ? 'erledigt' : 'offen';
  await api({ aktion: 'status', code: current.code, status });
  current.status = status;
  renderThread();
  loadList().catch(() => {});
});

$<HTMLButtonElement>('[data-back]').addEventListener('click', () => {
  current = null;
  window.clearInterval(detailTimer);
  detail.hidden = true;
  empty.hidden = false;
  document.body.classList.remove('has-detail');
});

// files in the thread: open (download through the password) or delete
$<HTMLElement>('[data-detail-thread]').addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLButtonElement>('[data-file]');
  const del = t.closest<HTMLButtonElement>('[data-file-del]');
  if (!current || (!open && !del)) return;
  if (del) {
    if (!confirm('Diese Datei löschen?')) return;
    await api({ aktion: 'datei-loeschen', code: current.code, id: del.dataset.fileDel }).catch(() => {});
    del.closest('.mp-file')?.classList.add('is-gone');
    return;
  }
  const res = await fetch('/api/mentor-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mentor-passwort': password },
    body: JSON.stringify({ aktion: 'datei', code: current.code, id: open!.dataset.file }),
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
      headers: { 'content-type': 'application/octet-stream', 'x-mentor-passwort': password, 'x-code': current.code, 'x-ziel': 'mentor', 'x-dateiname': encodeURIComponent(file.name) },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.file) err.textContent = data.error ?? 'Das hat nicht geklappt.';
    else replyFiles.push({ id: data.file.id, name: data.file.name });
  }
  replyInput.value = '';
  renderReplyFiles();
});

const reply = $<HTMLFormElement>('[data-reply]');
reply.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const area = reply.elements.namedItem('text') as HTMLTextAreaElement;
  const text = area.value.trim();
  const err = $<HTMLElement>('[data-reply-error]');
  err.textContent = '';
  if (!text && !replyFiles.length) return;
  const btn = reply.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  btn.disabled = true;
  try {
    await api({ aktion: 'antworten', code: current.code, text, dateien: replyFiles.map((f) => f.id) });
    area.value = '';
    replyFiles = [];
    renderReplyFiles();
    await openThread(current.code);
  } catch (x) {
    err.textContent = (x as Error).message;
  } finally {
    btn.disabled = false;
  }
});
reply.querySelector('textarea')!.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) reply.requestSubmit();
});

// ---------- accesses ----------
function renderAccess(rows: Access[], waitlist: number) {
  $<HTMLElement>('[data-waitlist]').textContent = `${rows.length} selbst angeforderte Zugänge${waitlist ? `, ${waitlist} auf der Warteliste` : ''}. Codes aus PATHFINDER_ACCESS_CODES stehen nicht in dieser Liste.`;
  const body = $<HTMLElement>('[data-access]');
  body.innerHTML = rows.length
    ? rows
        .map(
          (r) => `<tr class="${r.gesperrt ? 'is-blocked' : ''}"><td>${esc(r.vorname)}</td><td class="mp-mono">${esc(r.code)}</td><td>${when(r.erstellt)}</td><td>${when(r.zuletztBenutzt)}</td>
          <td><button type="button" class="btn btn--quiet btn--small" data-block="${esc(r.code)}" data-on="${r.gesperrt ? '0' : '1'}">${r.gesperrt ? 'Entsperren' : 'Sperren'}</button></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="mp-empty">Noch keine Zugänge angefordert.</td></tr>';
  body.querySelectorAll<HTMLButtonElement>('[data-block]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      await api({ aktion: 'sperren', code: b.dataset.block, gesperrt: b.dataset.on === '1' }).catch(() => {});
      await loadList().catch(() => {});
    }),
  );
}

// already signed in in this tab?
if (password) loadList().then(start, () => logout());
