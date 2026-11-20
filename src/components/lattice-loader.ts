/**
 * LatticeLoader: a small grid of dots that runs a pattern while something works, then turns
 * into a tick (done) or a cross (error), with a label and an elapsed timer.
 * Vanilla TypeScript port of the React Bits "LatticeLoader" component (https://reactbits.dev,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0). Same CSS, same
 * patterns and options; plain HTML plus a 100 ms timer instead of React. Used as part of this
 * website only.
 *
 *   const loader = createLatticeLoader({ label: 'Denkt nach' });
 *   parent.append(loader.el);
 *   loader.setStatus('done');
 */
import './lattice-loader.css';

export type LatticeStatus = 'working' | 'done' | 'error';
interface Pattern {
  cells: (number | null)[];
  loop: number;
  scale: number;
  lit?: number;
}

const PATTERNS: Record<string, Record<number, Pattern>> = {
  arrow: { 3: { cells: [1, 2, 3, 0, 1, 2, 1, 2, 3], loop: 7.2, scale: 1 } },
  dots: { 3: { cells: [0, 1, 2, 0, 1, 2, 0, 1, 2], loop: 3, scale: 2.4 } },
  ripple: { 3: { cells: [2, 1, 2, 1, 0, 1, 2, 1, 2], loop: 4.8, scale: 1.5 } },
  spiral: { 3: { cells: [0, 1, 2, 7, 8, 3, 6, 5, 4], loop: 9, scale: 1.2, lit: 0.35 } },
  orbit: {
    3: { cells: [0, 1, 2, 7, null, 3, 6, 5, 4], loop: 8, scale: 1.2 },
    4: { cells: [0, 1, 2, 3, 11, null, null, 4, 10, null, null, 5, 9, 8, 7, 6], loop: 6, scale: 1.2, lit: 0.45 },
  },
  snake: {
    3: { cells: [0, 1, 2, 5, 4, 3, 6, 7, 8], loop: 9, scale: 1, lit: 0.35 },
    4: { cells: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12], loop: 16, scale: 1, lit: 0.25 },
  },
  sweep: { 4: { cells: [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6], loop: 5, scale: 1, lit: 0.45 } },
  spin: { 4: { cells: [0, 0, 1, 1, 0, 0, 1, 1, 3, 3, 2, 2, 3, 3, 2, 2], loop: 4, scale: 1.6, lit: 0.35 } },
  rain: { 4: { cells: [0, 2, 1, 3, 1, 3, 2, 4, 2, 4, 3, 5, 3, 5, 4, 6], loop: 4, scale: 1.2, lit: 0.35 } },
  pulse: { 4: { cells: [2, 1, 1, 2, 1, 0, 0, 1, 1, 0, 0, 1, 2, 1, 1, 2], loop: 2.4, scale: 2.5, lit: 0.45 } },
};
const DEFAULT_PATTERN: Record<number, string> = { 3: 'orbit', 4: 'sweep' };
const MARKS: Record<number, Record<'done' | 'error', number[]>> = {
  3: { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] },
  4: { done: [7, 8, 10, 13], error: [0, 3, 5, 6, 9, 10, 12, 15] },
};

const resolvePattern = (pattern: string | Partial<Pattern>, grid: number): Pattern => {
  if (typeof pattern === 'string') {
    const named = PATTERNS[pattern];
    return (named && named[grid]) || PATTERNS[DEFAULT_PATTERN[grid]][grid];
  }
  const cells = Array.from({ length: grid * grid }, (_, i) => pattern.cells?.[i] ?? null);
  const max = Math.max(0, ...cells.filter((v): v is number => v != null));
  return { cells, loop: pattern.loop ?? max + 4.2, scale: pattern.scale ?? 1, lit: pattern.lit ?? 0.62 };
};
const fmt = (ds: number) => (ds < 600 ? `${(ds / 10).toFixed(1)}s` : `${Math.floor(ds / 600)}m ${((ds % 600) / 10).toFixed(1)}s`);
const spoken = (ds: number) =>
  ds < 600
    ? `${(ds / 10).toFixed(1).replace('.', ',')} Sekunden`
    : `${Math.floor(ds / 600)} Minuten ${((ds % 600) / 10).toFixed(1).replace('.', ',')} Sekunden`;

export interface LatticeOptions {
  label?: string;
  doneLabel?: string;
  errorLabel?: string;
  status?: LatticeStatus;
  pattern?: string | Partial<Pattern>;
  grid?: 3 | 4;
  shape?: 'round' | 'square';
  color?: string;
  doneColor?: string;
  errorColor?: string;
  cellSize?: number;
  gap?: number;
  fontSize?: number;
  step?: number;
  idleOpacity?: number;
  glow?: boolean;
  glowColor?: string;
  showTimer?: boolean;
  className?: string;
}

export interface LatticeHandle {
  el: HTMLElement;
  setStatus(status: LatticeStatus): void;
  /** elapsed time in seconds */
  elapsed(): number;
  destroy(): void;
}

export function createLatticeLoader(options: LatticeOptions = {}): LatticeHandle {
  const {
    label = 'Denkt nach',
    doneLabel = 'Fertig in',
    errorLabel = 'Fehlgeschlagen nach',
    pattern = 'orbit',
    grid = 3,
    shape = 'round',
    color = 'currentColor',
    doneColor = '#22c55e',
    errorColor = '#ef4444',
    cellSize = 6,
    gap = 2,
    fontSize = 14,
    step = 90,
    idleOpacity = 0.15,
    glow = false,
    glowColor = '',
    showTimer = true,
    className = '',
  } = options;
  const n = grid === 4 ? 4 : 3;
  const pat = resolvePattern(pattern, n);
  const marks = MARKS[n];
  const d = step * pat.scale;
  const cycle = Math.round(pat.loop * d);

  const el = document.createElement('span');
  el.setAttribute('role', 'status');
  el.className = `lattice-loader${className ? ` ${className}` : ''}`;
  el.dataset.shape = shape;
  if (glow) el.dataset.glow = '';
  const vars: Record<string, string> = {
    '--ll-n': String(n),
    '--ll-cell': `${cellSize}px`,
    '--ll-gap': `${gap}px`,
    '--ll-font': `${fontSize}px`,
    '--ll-color': color,
    '--ll-idle': String(idleOpacity),
    '--ll-glow': glowColor || color,
    '--ll-cycle': `${cycle}ms`,
  };
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));

  const lit = pat.lit && pat.lit !== 0.62 ? String(Math.round(pat.lit * 100)) : '';
  const run = pat.cells
    .map((unit) =>
      unit == null
        ? '<span class="lattice-loader__cell" data-hole=""></span>'
        : `<span class="lattice-loader__cell"${lit ? ` data-lit="${lit}"` : ''} style="animation-delay:${Math.round(unit * d)}ms"></span>`,
    )
    .join('');
  const mark = pat.cells.map((_, i) => `<span class="lattice-loader__cell" data-i="${i}"></span>`).join('');
  const t = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  el.innerHTML =
    `<span class="lattice-loader__grid" aria-hidden="true">` +
    `<span class="lattice-loader__layer lattice-loader__run">${run}</span>` +
    `<span class="lattice-loader__layer lattice-loader__mark">${mark}</span></span>` +
    `<span class="lattice-loader__label" aria-hidden="true">` +
    `<span class="lattice-loader__text" data-s="working">${t(label)}</span>` +
    `<span class="lattice-loader__text" data-s="done">${t(doneLabel)}</span>` +
    `<span class="lattice-loader__text" data-s="error">${t(errorLabel)}</span></span>` +
    (showTimer ? '<span class="lattice-loader__timer" aria-hidden="true">0.0s</span>' : '') +
    '<span class="lattice-loader__sr"></span>';

  const timer = el.querySelector<HTMLElement>('.lattice-loader__timer');
  const sr = el.querySelector<HTMLElement>('.lattice-loader__sr')!;
  let ds = 0;
  let interval = 0;
  let status: LatticeStatus | null = null;
  const paint = (v: number) => {
    ds = v;
    if (timer) timer.textContent = fmt(v);
  };

  function setStatus(next: LatticeStatus) {
    if (next === status) return;
    status = next;
    el.dataset.status = next;
    el.querySelectorAll<HTMLElement>('.lattice-loader__text').forEach((s) => s.toggleAttribute('data-active', s.dataset.s === next));
    if (next === 'working') {
      clearInterval(interval);
      const startedAt = performance.now();
      paint(0);
      interval = window.setInterval(() => paint(Math.floor((performance.now() - startedAt) / 100)), 100);
      sr.textContent = `${label}, läuft`;
      return;
    }
    clearInterval(interval);
    const c = next === 'error' ? errorColor : doneColor;
    el.style.setProperty('--ll-mark', c);
    el.style.setProperty('--ll-mark-glow', glowColor || c);
    el.querySelectorAll<HTMLElement>('.lattice-loader__mark .lattice-loader__cell').forEach((cell) =>
      cell.toggleAttribute('data-on', marks[next].includes(Number(cell.dataset.i))),
    );
    sr.textContent = `${next === 'done' ? doneLabel : errorLabel}${showTimer ? ` ${spoken(ds)}` : ''}`;
  }

  setStatus(options.status ?? 'working');
  return {
    el,
    setStatus,
    elapsed: () => ds / 10,
    destroy() {
      clearInterval(interval);
      el.remove();
    },
  };
}
