/**
 * TiltedCard: a vanilla TypeScript take on the React Bits TiltedCard idea, extended
 * with a flip side. No React.
 *
 * - spring physics for tilt, scale and flip
 * - glare and edge light that follow the pointer, a shadow that moves with the tilt
 * - layer parallax: children with data-depth="15" move with the tilt
 * - intro animation, gentle floating while idle
 * - click / tap / Enter / Space flips the card, focusable, screen readers only get the visible side
 * - prefers-reduced-motion: no tilt, no float, no intro, the flip is a short crossfade
 * - no gyroscope (it would trigger the iOS motion permission prompt)
 *
 * Markup (see createTiltedCardMarkup below):
 *   .tc > .tc__shadow + .tc__float > .tc__card > .tc__face--front + .tc__face--back
 */
import './tilted-card.css';

export interface TiltedCardOptions {
  rotateAmplitude?: number;
  scaleOnHover?: number;
  /** 0..1 glare strength */
  glare?: number;
  glareColor?: string;
  /** 0..1 shadow strength */
  shadow?: number;
  radius?: number;
  /** 0..1, higher = softer, slower springs */
  smoothness?: number;
  intro?: boolean;
  floating?: boolean;
  flippable?: boolean;
  /** accessible name; gets ", Rückseite" / ", Vorderseite" appended */
  label?: string;
  onFlip?: (showingBack: boolean) => void;
}

interface Spring {
  x: number;
  v: number;
  target: number;
}
const spring = (x = 0): Spring => ({ x, v: 0, target: x });

export class TiltedCard {
  readonly root: HTMLElement;
  private card: HTMLElement;
  private float: HTMLElement;
  private shadowEl: HTMLElement | null;
  private front: HTMLElement;
  private back: HTMLElement | null;
  private glareEl: HTMLElement | null;
  private edgeEl: HTMLElement | null;
  private layers: { el: HTMLElement; depth: number }[];
  private o: Required<Omit<TiltedCardOptions, 'onFlip' | 'label'>> & Pick<TiltedCardOptions, 'onFlip' | 'label'>;
  private reduce: boolean;
  private rx = spring();
  private ry = spring();
  private scale = spring(1);
  private flip = spring(0);
  private hover = spring(0);
  private gx = 50;
  private gy = 30;
  private showingBack = false;
  private hovered = false;
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private visible = true;
  private io: IntersectionObserver;
  private downAt: { x: number; y: number; t: number } | null = null;
  private listeners: [EventTarget, string, EventListener][] = [];

  constructor(root: HTMLElement, options: TiltedCardOptions = {}) {
    this.root = root;
    this.o = {
      rotateAmplitude: 12,
      scaleOnHover: 1.04,
      glare: 0.35,
      glareColor: '#F4F2EE',
      shadow: 0.5,
      radius: 24,
      smoothness: 0.6,
      intro: true,
      floating: true,
      flippable: true,
      ...options,
    };
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.card = root.querySelector('.tc__card')!;
    this.float = root.querySelector('.tc__float')!;
    this.shadowEl = root.querySelector('.tc__shadow');
    this.front = root.querySelector('.tc__face--front')!;
    this.back = root.querySelector('.tc__face--back');
    this.glareEl = root.querySelector('.tc__glare');
    this.edgeEl = root.querySelector('.tc__edge');
    this.layers = [...root.querySelectorAll<HTMLElement>('[data-depth]')].map((el) => ({ el, depth: Number(el.dataset.depth) || 0 }));

    root.style.setProperty('--tc-radius', `${this.o.radius}px`);
    root.style.setProperty('--tc-glare-color', this.o.glareColor);
    root.classList.toggle('tc--reduced', this.reduce);

    if (this.o.flippable && this.back) {
      root.tabIndex = 0;
      root.setAttribute('role', 'button');
      this.updateA11y();
      this.on(root, 'keydown', (e) => {
        const k = (e as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') {
          e.preventDefault();
          this.toggle();
        }
      });
      this.on(root, 'pointerdown', (e) => {
        const p = e as PointerEvent;
        this.downAt = { x: p.clientX, y: p.clientY, t: performance.now() };
      });
      this.on(root, 'pointerup', (e) => {
        const p = e as PointerEvent;
        const d = this.downAt;
        this.downAt = null;
        if (d && Math.hypot(p.clientX - d.x, p.clientY - d.y) < 10 && performance.now() - d.t < 600) this.toggle();
      });
    }

    if (!this.reduce) {
      this.on(root, 'pointermove', (e) => this.onMove(e as PointerEvent));
      this.on(root, 'pointerleave', () => this.onLeave());
      this.on(root, 'pointerenter', (e) => {
        if ((e as PointerEvent).pointerType !== 'touch') this.setHover(true);
      });
    }

    if (this.o.intro && !this.reduce) {
      this.rx.x = 16;
      this.ry.x = -26;
      this.scale.x = 0.9;
      this.root.classList.add('tc--intro');
      requestAnimationFrame(() => this.root.classList.remove('tc--intro'));
    }

    this.io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.wake();
    });
    this.io.observe(root);
    this.write();
    this.wake();
  }

  /** flip to the other side */
  toggle(): void {
    this.setSide(!this.showingBack);
  }

  setSide(back: boolean): void {
    if (!this.back || back === this.showingBack) return;
    this.showingBack = back;
    this.flip.target = back ? 180 : 0;
    if (this.reduce) {
      this.flip.x = this.flip.target;
      this.flip.v = 0;
      this.root.classList.add('tc--fading');
      window.setTimeout(() => this.root.classList.remove('tc--fading'), 180);
    }
    this.updateA11y();
    this.o.onFlip?.(back);
    this.wake();
  }

  get isBack(): boolean {
    return this.showingBack;
  }

  /** the front face element (for exporting it as an image) */
  get frontFace(): HTMLElement {
    return this.front;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
  }

  /* ---------- internals ---------- */

  private on(t: EventTarget, type: string, fn: EventListener) {
    t.addEventListener(type, fn);
    this.listeners.push([t, type, fn]);
  }

  private updateA11y() {
    if (!this.back) return;
    // the name comes from the visible side's text; aria-pressed tells which side is up
    this.root.setAttribute('aria-pressed', String(this.showingBack));
    if (this.o.label) this.root.setAttribute('aria-description', this.o.label);
    this.front.setAttribute('aria-hidden', String(this.showingBack));
    this.back.setAttribute('aria-hidden', String(!this.showingBack));
  }

  private setHover(on: boolean) {
    this.hovered = on;
    this.scale.target = on ? this.o.scaleOnHover : 1;
    this.hover.target = on ? 1 : 0;
    this.wake();
  }

  private onMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    if (!this.hovered) this.setHover(true);
    const r = this.root.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const a = this.o.rotateAmplitude;
    this.ry.target = px * 2 * a;
    this.rx.target = -py * 2 * a;
    this.gx = (px + 0.5) * 100;
    this.gy = (py + 0.5) * 100;
    this.wake();
  }

  private onLeave() {
    this.setHover(false);
    this.rx.target = 0;
    this.ry.target = 0;
  }

  private step(s: Spring, dt: number, stiffness: number, damping: number) {
    const a = stiffness * (s.target - s.x) - damping * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  }

  private settled(s: Spring) {
    return Math.abs(s.target - s.x) < 0.01 && Math.abs(s.v) < 0.01;
  }

  private wake() {
    if (!this.raf && this.visible) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    // rAF timestamps can be slightly earlier than performance.now() at wake(): never go negative
    const dt = Math.max(0, Math.min(0.034, (now - this.last) / 1000));
    this.last = now;
    // smoothness 0 = snappy, 1 = soft
    const k = 320 - 240 * this.o.smoothness;
    const c = 2 * Math.sqrt(k) * 0.72; // slightly under-damped
    const floating = this.o.floating && !this.reduce && !this.hovered;
    if (floating) {
      const t = (now - this.t0) / 1000;
      this.rx.target = Math.sin(t * 0.7) * 2.6;
      this.ry.target = Math.cos(t * 0.5) * 3.6;
    }
    // sub-steps keep the spring stable on slow frames
    for (let i = 0; i < 4; i++) {
      for (const s of [this.rx, this.ry]) this.step(s, dt / 4, k, c);
      this.step(this.scale, dt / 4, k, c);
      this.step(this.hover, dt / 4, k, c);
      this.step(this.flip, dt / 4, 140, 2 * Math.sqrt(140) * 0.62);
    }
    this.write();
    const busy = floating || ![this.rx, this.ry, this.scale, this.flip, this.hover].every((s) => this.settled(s));
    if (busy && this.visible) this.raf = requestAnimationFrame(this.frame);
  };

  private write() {
    const rx = this.rx.x;
    const ry = this.ry.x;
    const flip = this.flip.x;
    this.card.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${(ry + flip).toFixed(2)}deg) scale(${this.scale.x.toFixed(4)})`;
    if (this.o.floating && !this.reduce) {
      const t = (performance.now() - this.t0) / 1000;
      this.float.style.transform = `translateY(${(Math.sin(t * 0.9) * 4 * (1 - this.hover.x)).toFixed(2)}px)`;
    }
    const a = this.o.rotateAmplitude || 1;
    for (const { el, depth } of this.layers) {
      el.style.transform = `translate3d(${((ry / a) * depth * 0.35).toFixed(2)}px, ${((-rx / a) * depth * 0.35).toFixed(2)}px, 0)`;
    }
    const h = Math.max(0, Math.min(1, this.hover.x));
    if (this.glareEl) {
      this.glareEl.style.opacity = (this.o.glare * h).toFixed(3);
      this.glareEl.style.setProperty('--gx', `${this.gx.toFixed(1)}%`);
      this.glareEl.style.setProperty('--gy', `${this.gy.toFixed(1)}%`);
    }
    if (this.edgeEl) {
      this.edgeEl.style.opacity = (0.25 + 0.75 * h).toFixed(3);
      this.edgeEl.style.setProperty('--gx', `${this.gx.toFixed(1)}%`);
      this.edgeEl.style.setProperty('--gy', `${this.gy.toFixed(1)}%`);
    }
    if (this.shadowEl) {
      this.shadowEl.style.transform = `translate(${(-ry * 1.2).toFixed(1)}px, ${(18 + rx * 1.2).toFixed(1)}px) scale(${(0.92 + (this.scale.x - 1) * 1.5).toFixed(3)})`;
      this.shadowEl.style.opacity = (this.o.shadow * (0.75 + 0.25 * h)).toFixed(3);
    }
    // the hidden side must not catch clicks or show through
    const backVisible = ((((flip % 360) + 360) % 360) > 90 && (((flip % 360) + 360) % 360) < 270);
    this.root.classList.toggle('tc--back', backVisible);
  }
}
