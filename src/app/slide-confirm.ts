/**
 * Slide to confirm: a dark pill with a round handle. Drag the handle to the end (about 90
 * percent) to confirm; let go earlier and it springs back. Keyboard: Enter, Space or
 * Arrow right once shows a hint, a second press within a few seconds confirms.
 *
 * onConfirm decides what happens: resolve 'done' (locked green state), 'cancel' (back to
 * the start, no message) or throw (back to the start with an error message). While it runs
 * the control is locked, so it can never fire twice.
 */
export type SlideResult = 'done' | 'cancel';

export interface SlideOptions {
  label: string;
  pendingLabel: string;
  doneLabel: string;
  errorText: string;
  keyHint: string;
  onConfirm: () => Promise<SlideResult>;
}

export interface SlideHandle {
  el: HTMLElement;
  /** show the locked green state straight away (request sent earlier) */
  markDone(animate?: boolean): void;
  /** back to the start (other access code, data deleted) */
  reset(): void;
}

const THRESHOLD = 0.9;

export function createSlideConfirm(o: SlideOptions): SlideHandle {
  const wrap = document.createElement('div');
  wrap.className = 'slide-wrap';
  wrap.innerHTML = `
    <div class="slide" data-state="idle" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
         aria-label="${o.label}" aria-valuetext="${o.label}">
      <span class="slide__sheen" aria-hidden="true"></span>
      <span class="slide__fill" aria-hidden="true"></span>
      <span class="slide__text" aria-hidden="true">${o.label}</span>
      <span class="slide__pending" aria-hidden="true">${o.pendingLabel}</span>
      <span class="slide__done" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        <span>${o.doneLabel}</span>
      </span>
      <span class="slide__knob" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>
      </span>
    </div>
    <p class="slide__msg" role="status" aria-live="polite"></p>`;
  const track = wrap.querySelector<HTMLElement>('.slide')!;
  const knob = wrap.querySelector<HTMLElement>('.slide__knob')!;
  const msg = wrap.querySelector<HTMLElement>('.slide__msg')!;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  let state: 'idle' | 'dragging' | 'pending' | 'done' = 'idle';
  let x = 0; // knob offset in px
  let startX = 0;
  let pointerId = -1;
  let armedUntil = 0;

  const maxX = () => track.clientWidth - knob.offsetWidth - 2 * knobInset();
  const knobInset = () => parseFloat(getComputedStyle(knob).left) || 4;
  const setX = (v: number) => {
    x = Math.max(0, Math.min(v, maxX()));
    const p = maxX() > 0 ? x / maxX() : 0;
    track.style.setProperty('--x', `${x}px`);
    track.style.setProperty('--p', String(p));
    track.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  };
  const setState = (s: typeof state) => {
    state = s;
    track.dataset.state = s;
  };

  const springBack = () => {
    setState('idle');
    setX(0);
    track.setAttribute('aria-valuetext', o.label);
  };

  async function confirm() {
    if (state === 'pending' || state === 'done') return;
    setState('pending');
    setX(maxX());
    msg.textContent = '';
    track.setAttribute('aria-valuetext', o.pendingLabel);
    track.setAttribute('aria-disabled', 'true');
    try {
      const result = await o.onConfirm();
      if (result === 'done') return markDone(true);
      track.removeAttribute('aria-disabled');
      springBack();
    } catch {
      track.removeAttribute('aria-disabled');
      springBack();
      msg.dataset.tone = 'error';
      msg.textContent = o.errorText;
    }
  }

  function markDone(animate = false) {
    setState('done');
    setX(maxX());
    track.classList.toggle('is-instant', !animate || reduce.matches);
    track.setAttribute('aria-disabled', 'true');
    track.setAttribute('aria-valuenow', '100');
    track.setAttribute('aria-valuetext', o.doneLabel);
    track.tabIndex = -1;
    // announced to screen readers only; the pill already says it
    msg.dataset.tone = 'sr';
    msg.textContent = animate ? o.doneLabel : '';
  }

  track.addEventListener('pointerdown', (e) => {
    if (state !== 'idle' || e.button > 0) return;
    // grab the knob, or tap the track near the knob
    const r = knob.getBoundingClientRect();
    if (e.clientX > r.right + 24) return;
    pointerId = e.pointerId;
    track.setPointerCapture(pointerId);
    startX = e.clientX - x;
    setState('dragging');
    msg.textContent = '';
    delete msg.dataset.tone;
  });
  // the blue glint follows the pointer, like on the metal button of the homepage
  track.addEventListener('pointermove', (e) => {
    const r = track.getBoundingClientRect();
    track.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  });
  track.addEventListener('pointerleave', () => track.style.removeProperty('--mx'));
  track.addEventListener('pointermove', (e) => {
    if (state !== 'dragging' || e.pointerId !== pointerId) return;
    setX(e.clientX - startX);
  });
  const release = (e: PointerEvent) => {
    if (state !== 'dragging' || e.pointerId !== pointerId) return;
    pointerId = -1;
    if (maxX() > 0 && x / maxX() >= THRESHOLD) confirm();
    else springBack();
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  track.addEventListener('keydown', (e) => {
    if (state !== 'idle') return;
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const now = Date.now();
    if (now < armedUntil) {
      armedUntil = 0;
      confirm();
    } else {
      armedUntil = now + 5000;
      delete msg.dataset.tone;
      msg.textContent = o.keyHint;
    }
  });
  track.addEventListener('blur', () => {
    armedUntil = 0;
    if (state === 'idle' && msg.textContent === o.keyHint) msg.textContent = '';
  });
  new ResizeObserver(() => {
    if (state === 'pending' || state === 'done') setX(maxX());
  }).observe(track);

  function reset() {
    track.classList.remove('is-instant');
    track.removeAttribute('aria-disabled');
    track.tabIndex = 0;
    msg.textContent = '';
    delete msg.dataset.tone;
    springBack();
  }

  return { el: wrap, markDone, reset };
}
