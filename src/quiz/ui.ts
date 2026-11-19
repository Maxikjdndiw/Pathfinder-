/**
 * Pathfinder Run interface. All text comes from content.ts, all scoring from engine.ts.
 * Nothing is sent anywhere; only the last result is kept in localStorage.
 */
import { gsap } from 'gsap';
import { SIGNUP_URL } from '../config';
import {
  ARCHETYPES,
  C1,
  C2,
  C3,
  C4,
  COPY,
  DILEMMAS,
  DILEMMA_INTRO,
  FIELDS,
  FUN_QUESTION,
  RADAR_LABELS,
  SETUP,
  STORAGE_KEY,
  TRAITS,
  type Field,
  type Metrics,
  type PosterRound,
} from './content';
import { computeResult, radarValue, type TraitVector } from './engine';
import { mountResultCard, type CardData } from './card';
import type { TiltedCard } from '../components/tilted-card';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const esc = (t: string | number) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const euro = (n: number) => `${n.toLocaleString('de-DE')} €`;
const niceNumber = (n: number) => Number(n.toPrecision(2)).toLocaleString('de-DE');
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const ARROW = '<span class="btn__arrow" aria-hidden="true">→</span>';
const CHEVRON = '<svg class="q-field__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface SavedResult {
  v: 1;
  date: string;
  archetype: string;
  blend: { id: string; percent: number }[];
  top: { id: string; percent: number }[];
  wildcard: { id: string; percent: number };
  traits: TraitVector;
  sentences: string[];
  grade: string;
  abroad: string;
}

function loadSaved(): SavedResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedResult;
    if (data?.v !== 1 || !ARCHETYPES.some((a) => a.id === data.archetype)) return null;
    return data;
  } catch {
    return null;
  }
}

function save(data: SavedResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode or storage blocked: the result still shows, it is just not kept */
  }
}

const fieldById = (id: string) => FIELDS.find((f) => f.id === id)!;
const archetypeById = (id: string) => ARCHETYPES.find((a) => a.id === id)!;

/* ------------------------------------------------------------------ */
/* app                                                                 */
/* ------------------------------------------------------------------ */

type StepId =
  | 'setup-grade'
  | 'setup-abroad'
  | 'c1'
  | 'c1-fun'
  | 'c2'
  | 'c2-fun'
  | 'c3'
  | 'c3-fun'
  | 'c4'
  | 'c4-fun'
  | 'd-intro'
  | `d${number}`
  | 'result';

const STEPS: StepId[] = [
  'setup-grade',
  'setup-abroad',
  'c1',
  'c1-fun',
  'c2',
  'c2-fun',
  'c3',
  'c3-fun',
  'c4',
  'c4-fun',
  'd-intro',
  ...DILEMMAS.map((d) => d.id as StepId),
  'result',
];

export class QuizApp {
  private stage: HTMLElement;
  private progress: HTMLElement | null;
  private fill: HTMLElement | null;
  private current: HTMLElement | null = null;
  private cleanup: (() => void) | null = null;
  private metrics: Metrics = {};
  private grade = '';
  private abroad = '';
  private noTimer = false;
  private card: TiltedCard | null = null;

  constructor(stage: HTMLElement) {
    this.stage = stage;
    this.progress = document.querySelector('.quiz__progress');
    this.fill = document.querySelector('.quiz__progress-fill');
    this.showStart();
  }

  /* ---------- navigation ---------- */

  private setProgress(step: StepId | null) {
    if (!this.progress || !this.fill) return;
    if (!step) {
      this.progress.hidden = true;
      return;
    }
    this.progress.hidden = false;
    const pct = Math.round(((STEPS.indexOf(step) + 1) / STEPS.length) * 100);
    this.fill.style.width = `${pct}%`;
    this.progress.setAttribute('aria-valuenow', String(pct));
  }

  /** swaps the screen with a slide and tilt, like the path cards */
  private show(html: string, opts: { wide?: boolean } = {}): HTMLElement {
    this.cleanup?.();
    this.cleanup = null;
    this.card?.destroy();
    this.card = null;
    const el = document.createElement('section');
    el.className = `q-screen${opts.wide ? ' q-screen--wide' : ''}`;
    el.innerHTML = html;
    const out = this.current;
    this.current = el;
    this.stage.appendChild(el);
    const reduce = reduceMotion();
    if (out) {
      out.style.position = 'absolute';
      out.style.top = '0';
      out.style.left = '0';
      out.style.right = '0';
      out.setAttribute('aria-hidden', 'true');
      out.querySelectorAll('button, input, a').forEach((n) => n.setAttribute('tabindex', '-1'));
      gsap.to(out, reduce ? { opacity: 0, duration: 0.15, onComplete: () => out.remove() } : { x: -70, rotate: -4, opacity: 0, duration: 0.32, ease: 'power2.in', onComplete: () => out.remove() });
    }
    if (reduce) gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15 });
    else gsap.fromTo(el, { x: 70, rotate: 4, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: out ? 0.1 : 0, clearProps: 'transform' });
    // keyboard and screen reader focus moves to the new heading
    const heading = el.querySelector<HTMLElement>('h1, h2');
    if (heading) {
      heading.tabIndex = -1;
      window.setTimeout(() => heading.focus({ preventScroll: true }), reduce ? 0 : 120);
    }
    if (out) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    return el;
  }

  private go(step: StepId) {
    this.setProgress(step);
    if (step === 'setup-grade') return this.setupGrade();
    if (step === 'setup-abroad') return this.setupAbroad();
    if (step === 'c1') return this.c1();
    if (step === 'c2') return this.c2();
    if (step === 'c3') return this.c3();
    if (step === 'c4') return this.c4();
    if (step === 'd-intro') return this.dilemmaIntro();
    if (step === 'result') return this.result();
    if (step.endsWith('-fun')) return this.fun(step.slice(0, 2) as 'c1' | 'c2' | 'c3' | 'c4');
    if (/^d\d$/.test(step)) return this.dilemma(Number(step.slice(1)) - 1);
  }

  private next(from: StepId) {
    this.go(STEPS[STEPS.indexOf(from) + 1]);
  }

  /* ---------- start ---------- */

  private showStart() {
    this.setProgress(null);
    const saved = loadSaved();
    const el = this.show(`
      <p class="q-kicker">2 Minuten. Kein Login. Keine Daten.</p>
      <h1 class="q-title q-title--hero">${COPY.start.heading}</h1>
      <p class="q-text">${COPY.start.text}</p>
      <div class="q-actions">
        <button class="btn btn--primary btn--large" type="button" data-start>${COPY.start.button}${ARROW}</button>
      </div>
      ${
        saved
          ? `<div class="q-last">
              <p>${esc(COPY.start.last(archetypeById(saved.archetype).name))}</p>
              <div class="q-last__actions">
                <button class="btn btn--glass btn--small" type="button" data-view>${COPY.start.view}</button>
                <button class="btn btn--glass btn--small" type="button" data-restart>${COPY.start.restart}</button>
              </div>
            </div>`
          : ''
      }`);
    const begin = () => {
      this.metrics = {};
      this.go('setup-grade');
    };
    el.querySelector('[data-start]')!.addEventListener('click', begin);
    el.querySelector('[data-restart]')?.addEventListener('click', begin);
    el.querySelector('[data-view]')?.addEventListener('click', () => saved && this.renderResult(saved));
  }

  /* ---------- setup ---------- */

  private setupGrade() {
    const el = this.show(`
      <h1 class="q-title">${SETUP.grade.question}</h1>
      <div class="q-options q-options--row" role="group" aria-label="${SETUP.grade.question}">
        ${SETUP.grade.options.map((g) => `<button class="q-option q-option--compact" type="button" data-v="${g}">${g}</button>`).join('')}
      </div>
      <p class="q-note">${SETUP.note}</p>`);
    el.querySelectorAll<HTMLButtonElement>('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        this.grade = b.dataset.v!;
        this.next('setup-grade');
      }),
    );
  }

  private setupAbroad() {
    const el = this.show(`
      <h1 class="q-title">${SETUP.abroad.question}</h1>
      <div class="q-options" role="group" aria-label="${SETUP.abroad.question}">
        ${SETUP.abroad.options.map((o) => `<button class="q-option" type="button" data-v="${o.id}">${o.label}</button>`).join('')}
      </div>
      <p class="q-note">${SETUP.note}</p>`);
    el.querySelectorAll<HTMLButtonElement>('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        this.abroad = b.dataset.v!;
        this.next('setup-abroad');
      }),
    );
  }

  /* ---------- fun question after each challenge ---------- */

  private fun(c: 'c1' | 'c2' | 'c3' | 'c4') {
    const el = this.show(`
      <p class="q-kicker">${esc(this.challengeTitle(c))}</p>
      <h1 class="q-title">${FUN_QUESTION}</h1>
      <div class="q-options q-options--pills" role="group" aria-label="${FUN_QUESTION}">
        <button class="q-pill" type="button" data-v="ja">${COPY.yes}</button>
        <button class="q-pill" type="button" data-v="nein">${COPY.no}</button>
      </div>`);
    el.querySelectorAll<HTMLButtonElement>('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        this.metrics[`${c}.fun`] = b.dataset.v;
        this.next(`${c}-fun` as StepId);
      }),
    );
  }

  private challengeTitle(c: 'c1' | 'c2' | 'c3' | 'c4') {
    return { c1: C1.title, c2: C2.title, c3: C3.title, c4: C4.title }[c];
  }

  /* ---------- C1 Die Schätzung ---------- */

  private c1() {
    const logMin = Math.log10(C1.min);
    const logMax = Math.log10(C1.max);
    const estimate = (v: number) => 10 ** (logMin + ((logMax - logMin) * v) / 1000);
    const el = this.show(`
      <p class="q-kicker">${COPY.challenge(1)} · ${C1.title}</p>
      <h1 class="q-title">${C1.text}</h1>
      <div class="q-slider q-slider--big">
        <output class="q-big" data-est-out for="c1-est">${niceNumber(estimate(500))}</output>
        <input id="c1-est" type="range" min="0" max="1000" step="1" value="500" aria-label="Deine Schätzung" aria-valuetext="${niceNumber(estimate(500))}">
        <span class="q-scale"><span>${C1.min.toLocaleString('de-DE')}</span><span>${C1.max.toLocaleString('de-DE')}</span></span>
      </div>
      <div class="q-slider">
        <label class="q-label" for="c1-conf">${C1.confidenceLabel} <output data-conf-out for="c1-conf">50 %</output></label>
        <input id="c1-conf" type="range" min="0" max="100" step="5" value="50" aria-valuetext="50 %">
      </div>
      <button class="q-link" type="button" data-hint>${C1.hintButton}</button>
      <p class="q-hint" data-hint-text hidden>${C1.hint}</p>
      <div class="q-actions" data-actions>
        <button class="btn btn--primary" type="button" data-done>${COPY.done}${ARROW}</button>
      </div>`);
    const t0 = performance.now();
    const est = el.querySelector<HTMLInputElement>('#c1-est')!;
    const conf = el.querySelector<HTMLInputElement>('#c1-conf')!;
    const estOut = el.querySelector<HTMLOutputElement>('[data-est-out]')!;
    const confOut = el.querySelector<HTMLOutputElement>('[data-conf-out]')!;
    let hint = false;
    est.addEventListener('input', () => {
      const text = niceNumber(estimate(Number(est.value)));
      estOut.textContent = text;
      est.setAttribute('aria-valuetext', text);
    });
    conf.addEventListener('input', () => {
      confOut.textContent = `${conf.value} %`;
      conf.setAttribute('aria-valuetext', `${conf.value} %`);
    });
    el.querySelector('[data-hint]')!.addEventListener('click', (e) => {
      hint = true;
      el.querySelector<HTMLElement>('[data-hint-text]')!.hidden = false;
      (e.currentTarget as HTMLButtonElement).disabled = true;
    });
    el.querySelector('[data-done]')!.addEventListener('click', () => {
      this.metrics['c1.time'] = (performance.now() - t0) / 1000;
      this.metrics['c1.conf'] = Number(conf.value);
      this.metrics['c1.hint'] = hint;
      est.disabled = true;
      conf.disabled = true;
      el.querySelector<HTMLButtonElement>('[data-hint]')!.disabled = true;
      const actions = el.querySelector<HTMLElement>('[data-actions]')!;
      actions.innerHTML = `<p class="q-feedback" role="status">${C1.after}</p>
        <button class="btn btn--primary" type="button" data-next>${COPY.next}${ARROW}</button>`;
      const nextBtn = actions.querySelector<HTMLButtonElement>('[data-next]')!;
      nextBtn.addEventListener('click', () => this.next('c1'));
      nextBtn.focus({ preventScroll: true });
    });
  }

  /* ---------- C2 Was stimmt hier nicht? ---------- */

  private posterHTML(r: PosterRound, flawed: boolean, side: number) {
    const shift = flawed && r.flaw === 'misaligned' ? ' p-head--shift' : '';
    const head = flawed && r.flawHeadline ? r.flawHeadline : r.headline;
    const btnStyle = flawed && r.flaw === 'color' ? ` style="background:${C2.clashColor};color:var(--ink)"` : '';
    const flawTarget = (part: 'head' | 'btn') => (flawed && ((r.flaw === 'color' && part === 'btn') || (r.flaw !== 'color' && part === 'head')) ? ' data-flaw' : '');
    return `<button class="q-poster" type="button" data-side="${side}" aria-label="Poster ${side === 0 ? 'links' : 'rechts'}">
      <span class="p-kicker">${esc(r.kicker)}</span>
      <span class="p-head${shift}"${flawTarget('head')}>${esc(head)}</span>
      <span class="p-body">${esc(r.body)}</span>
      <span class="p-btn"${btnStyle}${flawTarget('btn')}>${esc(r.button)}</span>
    </button>`;
  }

  private c2() {
    let round = 0;
    let timer = 0;
    let raf = 0;
    const playRound = () => {
      const r = C2.rounds[round];
      const flawSide = Math.random() < 0.5 ? 0 : 1;
      const el = this.show(`
        <p class="q-kicker">${COPY.challenge(2)} · ${C2.title} · Runde ${round + 1} von ${C2.rounds.length}</p>
        <div class="q-head-row">
          <h1 class="q-title">${C2.text}</h1>
          <span class="q-ring" aria-hidden="true">
            <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="q-ring__track"/><circle cx="22" cy="22" r="19" class="q-ring__bar" data-ring/></svg>
            <span data-sec>${C2.seconds}</span>
          </span>
        </div>
        <div class="q-posters">${this.posterHTML(r, flawSide === 0, 0)}${this.posterHTML(r, flawSide === 1, 1)}</div>
        <p class="q-feedback" role="status" data-feedback></p>`);
      const t0 = performance.now();
      const ring = el.querySelector<SVGCircleElement>('[data-ring]')!;
      const sec = el.querySelector<HTMLElement>('[data-sec]')!;
      const circumference = 2 * Math.PI * 19;
      ring.style.strokeDasharray = `${circumference}`;
      let done = false;
      const tick = () => {
        const left = Math.max(0, C2.seconds - (performance.now() - t0) / 1000);
        ring.style.strokeDashoffset = `${circumference * (1 - left / C2.seconds)}`;
        sec.textContent = String(Math.ceil(left));
        if (left > 0 && !done) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const finish = async (result: 'correct' | 'wrong' | 'timeout', time?: number) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        this.metrics[`c2.r${round + 1}.result`] = result;
        if (time !== undefined) this.metrics[`c2.r${round + 1}.time`] = time;
        el.querySelectorAll<HTMLButtonElement>('.q-poster').forEach((b) => (b.disabled = true));
        el.querySelector(`.q-poster[data-side="${flawSide}"]`)?.classList.add('is-flawed');
        el.querySelector<HTMLElement>('[data-flaw]')?.classList.add('is-shown');
        el.querySelector<HTMLElement>('[data-feedback]')!.textContent = result === 'correct' ? C2.correct : result === 'wrong' ? C2.wrong : C2.timeout;
        await wait(1200);
        if (this.current !== el) return;
        round++;
        if (round < C2.rounds.length) playRound();
        else this.next('c2');
      };
      timer = window.setTimeout(() => finish('timeout'), C2.seconds * 1000);
      el.querySelectorAll<HTMLButtonElement>('.q-poster').forEach((b) =>
        b.addEventListener('click', () => {
          const time = (performance.now() - t0) / 1000;
          if (Number(b.dataset.side) !== flawSide) b.classList.add('is-wrong');
          finish(Number(b.dataset.side) === flawSide ? 'correct' : 'wrong', time);
        }),
      );
      this.cleanup = () => {
        done = true;
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    };
    playRound();
  }

  /* ---------- C3 Das Muster ---------- */

  private c3() {
    let s = 0;
    const playSequence = () => {
      const seq = C3.sequences[s];
      const el = this.show(`
        <p class="q-kicker">${COPY.challenge(3)} · ${C3.title} · ${s + 1} von ${C3.sequences.length}</p>
        <h1 class="q-title">${C3.text}</h1>
        <p class="q-sequence" aria-label="${seq.shown.join(', ')}, und dann?">${seq.shown.join(', ')}, <span class="q-sequence__gap">?</span></p>
        <form class="q-answer" data-form novalidate>
          <label class="sr-only" for="c3-input">Deine Antwort</label>
          <input id="c3-input" class="q-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6" required>
          <button class="btn btn--primary" type="submit">${C3.check}</button>
        </form>
        <p class="q-feedback" role="status" data-feedback></p>
        <div class="q-actions q-actions--quiet">
          <button class="btn btn--glass btn--small" type="button" data-skip>${C3.skip}</button>
        </div>`);
      const input = el.querySelector<HTMLInputElement>('#c3-input')!;
      window.setTimeout(() => input.focus({ preventScroll: true }), reduceMotion() ? 0 : 450);
      let answered = false;
      el.querySelector<HTMLFormElement>('[data-form]')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (answered || input.value.trim() === '') return;
        answered = true;
        const ok = Number(input.value.trim()) === seq.answer;
        this.metrics[`c3.s${s + 1}`] = ok ? 'correct' : 'wrong';
        input.disabled = true;
        el.querySelector<HTMLElement>('[data-feedback]')!.textContent = ok ? C3.correct : C3.wrong(seq.answer);
        el.querySelector<HTMLElement>('.q-sequence__gap')!.textContent = String(seq.answer);
        await wait(1000);
        if (this.current !== el) return;
        s++;
        if (s < C3.sequences.length) playSequence();
        else this.next('c3');
      });
      el.querySelector('[data-skip]')!.addEventListener('click', () => {
        this.metrics['c3.skip'] = true;
        for (let k = s; k < C3.sequences.length; k++) if (!this.metrics[`c3.s${k + 1}`]) this.metrics[`c3.s${k + 1}`] = 'skipped';
        this.next('c3');
      });
    };
    playSequence();
  }

  /* ---------- C4 Das Budget ---------- */

  private c4() {
    const values: Record<string, number> = Object.fromEntries(C4.categories.map((c) => [c.key, 0]));
    const el = this.show(`
      <p class="q-kicker">${COPY.challenge(4)} · ${C4.title}</p>
      <h1 class="q-title">${C4.text}</h1>
      <div class="q-budget-bar" aria-hidden="true">${C4.categories.map((c) => `<span data-seg="${c.key}" style="background:${c.color}"></span>`).join('')}</div>
      <p class="q-left" role="status"><span>${C4.left}:</span> <strong data-left>${euro(C4.total)}</strong></p>
      <div class="q-budget">
        ${C4.categories
          .map(
            (c) => `<div class="q-budget__row">
              <label class="q-label" for="b-${c.key}"><span class="q-dot" style="background:${c.color}"></span>${c.label} <output data-out="${c.key}">${euro(0)}</output></label>
              <input id="b-${c.key}" type="range" min="0" max="${C4.total}" step="${C4.step}" value="0" data-key="${c.key}" aria-valuetext="${euro(0)}">
            </div>`,
          )
          .join('')}
      </div>
      <div class="q-actions">
        <button class="btn btn--primary" type="button" data-done disabled>${COPY.done}${ARROW}</button>
      </div>`);
    const done = el.querySelector<HTMLButtonElement>('[data-done]')!;
    const leftEl = el.querySelector<HTMLElement>('[data-left]')!;
    const used = () => Object.values(values).reduce((a, b) => a + b, 0);
    const render = () => {
      const left = C4.total - used();
      leftEl.textContent = euro(left);
      done.disabled = left !== 0;
      for (const c of C4.categories) {
        el.querySelector<HTMLElement>(`[data-seg="${c.key}"]`)!.style.width = `${(values[c.key] / C4.total) * 100}%`;
        el.querySelector<HTMLElement>(`[data-out="${c.key}"]`)!.textContent = euro(values[c.key]);
      }
    };
    el.querySelectorAll<HTMLInputElement>('input[data-key]').forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.dataset.key!;
        const others = used() - values[key];
        const v = Math.min(Number(input.value), C4.total - others);
        values[key] = v;
        input.value = String(v);
        input.setAttribute('aria-valuetext', euro(v));
        render();
      }),
    );
    done.addEventListener('click', () => {
      for (const c of C4.categories) this.metrics[`c4.${c.key}`] = values[c.key] / C4.total;
      this.next('c4');
    });
  }

  /* ---------- Dilemmas ---------- */

  private dilemmaIntro() {
    const el = this.show(`
      <p class="q-kicker">8 Entscheidungen</p>
      <h1 class="q-title">${DILEMMA_INTRO.heading}</h1>
      <p class="q-text">${DILEMMA_INTRO.text.replace(`${DILEMMA_INTRO.heading} `, '')}</p>
      <label class="q-switch">
        <input type="checkbox" role="switch" data-notimer ${this.noTimer ? 'checked' : ''}>
        <span class="q-switch__track" aria-hidden="true"><span class="q-switch__thumb"></span></span>
        <span>${DILEMMA_INTRO.noTimer}</span>
      </label>
      <div class="q-actions">
        <button class="btn btn--primary btn--large" type="button" data-go>${COPY.next}${ARROW}</button>
      </div>`);
    const toggle = el.querySelector<HTMLInputElement>('[data-notimer]')!;
    toggle.addEventListener('change', () => (this.noTimer = toggle.checked));
    el.querySelector('[data-go]')!.addEventListener('click', () => this.next('d-intro'));
  }

  private dilemma(i: number) {
    const d = DILEMMAS[i];
    const el = this.show(`
      <p class="q-kicker">${COPY.dilemma(i + 1)}</p>
      <h1 class="q-title q-title--dilemma">${esc(d.prompt ?? DILEMMA_INTRO.defaultPrompt)}</h1>
      ${this.noTimer ? '' : '<div class="q-timer" aria-hidden="true"><span data-timer></span></div>'}
      <div class="q-choices${d.options.length === 3 ? ' q-choices--three' : ''}">
        ${d.options.map((o) => `<button class="q-choice" type="button" data-v="${o.id}">${esc(o.text)}</button>`).join('')}
      </div>`);
    const t0 = performance.now();
    let decided = false;
    let timer = 0;
    const bar = el.querySelector<HTMLElement>('[data-timer]');
    if (bar) {
      bar.style.transition = `transform ${DILEMMA_INTRO.seconds}s linear`;
      requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.transform = 'scaleX(0)')));
      timer = window.setTimeout(async () => {
        if (decided) return;
        decided = true;
        this.metrics[d.id] = 'timeout';
        el.classList.add('is-timeout');
        el.querySelectorAll<HTMLButtonElement>('.q-choice').forEach((b) => (b.disabled = true));
        await wait(350);
        if (this.current === el) this.next(d.id as StepId);
      }, DILEMMA_INTRO.seconds * 1000);
    }
    el.querySelectorAll<HTMLButtonElement>('.q-choice').forEach((b) =>
      b.addEventListener('click', async () => {
        if (decided) return;
        decided = true;
        clearTimeout(timer);
        this.metrics[d.id] = b.dataset.v;
        this.metrics[`${d.id}.time`] = (performance.now() - t0) / 1000;
        b.classList.add('is-chosen');
        if (bar) {
          const now = getComputedStyle(bar).transform;
          bar.style.transition = 'none';
          bar.style.transform = now;
        }
        el.querySelectorAll<HTMLButtonElement>('.q-choice').forEach((x) => (x.disabled = true));
        await wait(260);
        if (this.current === el) this.next(d.id as StepId);
      }),
    );
    this.cleanup = () => clearTimeout(timer);
  }

  /* ---------- Result ---------- */

  private result() {
    const r = computeResult(this.metrics);
    const data: SavedResult = {
      v: 1,
      date: new Date().toISOString(),
      archetype: r.blend[0].archetype.id,
      blend: r.blend.map((b) => ({ id: b.archetype.id, percent: b.percent })),
      top: r.top.map((f) => ({ id: f.field.id, percent: f.percent })),
      wildcard: { id: r.wildcard.field.id, percent: r.wildcard.percent },
      traits: r.traits,
      sentences: r.sentences.map((s) => s.text),
      grade: this.grade,
      abroad: this.abroad,
    };
    save(data);
    this.renderResult(data);
  }

  private renderResult(data: SavedResult) {
    this.setProgress('result');
    const R = COPY.result;
    const card: CardData = {
      archetype: archetypeById(data.archetype),
      blend: data.blend.map((b) => ({ name: archetypeById(b.id).name, percent: b.percent })),
      top: data.top.map((f) => ({ name: fieldById(f.id).name, percent: f.percent })),
      wildcard: { name: fieldById(data.wildcard.id).name, percent: data.wildcard.percent },
    };
    const early = data.grade === '9' || data.grade === '10';
    const fields: { field: Field; percent: number; wild: boolean }[] = [
      ...data.top.map((f) => ({ field: fieldById(f.id), percent: f.percent, wild: false })),
      { field: fieldById(data.wildcard.id), percent: data.wildcard.percent, wild: true },
    ];
    const list = (items: string[]) => `<ul class="q-dl__list">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const el = this.show(
      `
      <h1 class="sr-only">Dein Ergebnis</h1>
      <div class="q-result">
        <div class="q-result__card" data-card></div>
        <div class="q-result__cta">
          <div class="q-result__buttons">
            <a class="btn btn--primary btn--large" href="${SIGNUP_URL}" target="_blank" rel="noopener">${R.cta}${ARROW}</a>
            <button class="btn btn--glass" type="button" data-share>${R.share}</button>
          </div>
          <p class="q-note">${R.ctaNote}</p>
          <p class="q-note q-share-status" role="status" data-share-status></p>
        </div>

        <section class="q-block" aria-labelledby="radar-h">
          <h2 class="q-block__title" id="radar-h">${R.radarHeading}</h2>
          ${radarSVG(data.traits)}
        </section>

        <section class="q-block" aria-labelledby="why-h">
          <h2 class="q-block__title" id="why-h">${R.whyHeading}</h2>
          <ol class="q-why">${data.sentences.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        </section>

        <section class="q-block" aria-labelledby="fields-h">
          <h2 class="q-block__title" id="fields-h">${R.detailsHeading}</h2>
          <div class="q-fields">
            ${fields
              .map(
                ({ field, percent, wild }) => `<details class="q-field${wild ? ' q-field--wild' : ''}">
                  <summary>
                    <span class="q-field__name">${wild ? `<span class="q-field__tag">${R.wildcard}</span>` : ''}${esc(field.name)}</span>
                    <span class="q-field__pct">${percent} % ${R.match}</span>${CHEVRON}
                  </summary>
                  <dl class="q-dl">
                    <div><dt>${R.jobs}</dt><dd>${list(field.jobs)}</dd></div>
                    <div><dt>${R.study}</dt><dd>${list(field.study)}</dd></div>
                    <div><dt>${R.unisDe}</dt><dd>${list(field.unisDe)}</dd></div>
                    ${data.abroad !== 'de' ? `<div><dt>${R.unisAbroad}</dt><dd>${list(field.unisAbroad)}</dd></div>` : ''}
                    <div><dt>${R.scholarship}</dt><dd>${list(field.scholarships)}</dd></div>
                    <div class="q-dl__step"><dt>${R.nextStep}</dt><dd>${esc(early ? field.stepEarly : field.stepLate)}</dd></div>
                  </dl>
                </details>`,
              )
              .join('')}
          </div>
        </section>

        <div class="q-actions q-actions--center">
          <button class="btn btn--glass" type="button" data-again>${R.again}</button>
        </div>
        <p class="q-footnote">${R.footnote}</p>
      </div>`,
      { wide: true },
    );
    this.card = mountResultCard(el.querySelector<HTMLElement>('[data-card]')!, card);
    el.querySelector('[data-again]')!.addEventListener('click', () => {
      this.metrics = {};
      this.go('setup-grade');
    });
    el.querySelector('[data-share]')!.addEventListener('click', (e) => this.share(e.currentTarget as HTMLButtonElement, card.archetype.id));
    // radar draws in when it scrolls into view
    const radar = el.querySelector<SVGElement>('.q-radar');
    if (radar) {
      const io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          radar.classList.add('is-in');
          io.disconnect();
        }
      }, { threshold: 0.3 });
      io.observe(radar);
      this.cleanup = () => io.disconnect();
    }
  }

  /** Card front as PNG: native share sheet on phones, download elsewhere */
  private async share(btn: HTMLButtonElement, slug: string) {
    const status = this.current?.querySelector<HTMLElement>('[data-share-status]');
    const front = this.card?.frontFace;
    if (!front) return;
    btn.disabled = true;
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(front, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#1D1D1F',
        filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('tc__glare') || n.classList.contains('tc__edge') || n.classList.contains('rc-hint'))),
        style: { transform: 'none', borderRadius: '24px' },
      });
      if (!blob) throw new Error('no image');
      const file = new File([blob], `pathfinder-run-${slug}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: COPY.result.shareTitle });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (status) status.textContent = 'Bild gespeichert.';
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError' && status) status.textContent = 'Teilen hat nicht geklappt. Mach einfach einen Screenshot.';
    } finally {
      btn.disabled = false;
    }
  }
}

/* ------------------------------------------------------------------ */
/* radar chart                                                         */
/* ------------------------------------------------------------------ */

function radarSVG(traits: TraitVector): string {
  const size = 320;
  const c = size / 2;
  const R = 112;
  const n = TRAITS.length;
  const point = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r];
  };
  const ring = (f: number) => TRAITS.map((_, i) => point(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const values = TRAITS.map((k, i) => point(i, (R * radarValue(traits[k])) / 100));
  const labels = RADAR_LABELS.map((label, i) => {
    const [x, y] = point(i, R + 26);
    const anchor = Math.abs(x - c) < 4 ? 'middle' : x > c ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}">${label}</text>`;
  }).join('');
  const desc = RADAR_LABELS.map((l, i) => `${l} ${Math.round(radarValue(traits[TRAITS[i]]))} von 100`).join(', ');
  return `<svg class="q-radar" viewBox="-40 0 ${size + 80} ${size}" role="img" aria-label="Dein Profil: ${desc}">
    ${[0.25, 0.5, 0.75, 1].map((f) => `<polygon class="q-radar__grid" points="${ring(f)}"/>`).join('')}
    ${TRAITS.map((_, i) => {
      const [x, y] = point(i, R);
      return `<line class="q-radar__axis" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }).join('')}
    <g class="q-radar__shape" style="transform-origin:${c}px ${c}px">
      <polygon class="q-radar__area" points="${values.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>
      ${values.map(([x, y]) => `<circle class="q-radar__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`).join('')}
    </g>
    <g class="q-radar__labels">${labels}</g>
  </svg>`;
}
