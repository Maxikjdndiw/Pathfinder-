/**
 * Topography: a landscape drawn in fine contour lines that rises gently under the cursor.
 * Vanilla TypeScript take on the React Bits "Topography" background (https://reactbits.dev,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0), recoloured for
 * the light stone theme: no glow, no click pulse. Used as part of this website only.
 *
 * One small fragment shader on plain WebGL (no Three.js, so the first screen stays light).
 * The canvas sits inside the "surface" element (hero + "Für wen") and has its size, so it
 * scrolls with the page like any other element and is never redrawn on scroll. It is drawn
 * once, on resize, and while the cursor lift eases out. The lines fade out at the end of the
 * surface and are stronger on the right.
 *
 * Returns null without WebGL; the caller then shows the static SVG.
 */
import './topography.css';

export interface TopographyOptions {
  /** the element the lines cover (hero + "Für wen") */
  surface: HTMLElement;
  /** where the lines start to fade out, as a share of the surface height */
  fadeFrom?: number;
}

export interface TopographyHandle {
  destroy(): void;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 uRes;      // canvas size in device px
uniform float uDpr;
uniform vec3 uMouse;    // x, y in surface coordinates (css px), strength 0..1
uniform float uStrength;
uniform vec2 uFade;     // vertical fade from, to (surface css px)
uniform float uSmall;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  // css px, relative to the surface (the canvas covers it exactly)
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 page = css;
  vec2 p = page / (uSmall > 0.5 ? 400.0 : 620.0);  // calm, large lines; a bit denser on phones
  float h = fbm(p);
  // the land rises gently under the cursor
  vec2 d = (page - uMouse.xy) / 260.0;
  h += uMouse.z * 0.11 * exp(-dot(d, d));

  float levels = 26.0;
  float v = h * levels;
  float fw = max(fwidth(v), 1e-4);
  float dist = abs(fract(v - 0.5) - 0.5) / fw;          // distance to the nearest line in px-ish units
  float line = 1.0 - smoothstep(0.35 * uDpr, 1.1 * uDpr, dist);
  vec3 col = vec3(0.824, 0.824, 0.843);     // #D2D2D7, every line the same colour

  // stronger on the right (behind the cards), fading towards the left
  float x = css.x / (uRes.x / uDpr);
  float side = uSmall > 0.5 ? 1.0 : mix(0.02, 1.0, smoothstep(0.3, 0.88, x));
  float down = 1.0 - smoothstep(uFade.x, uFade.y, page.y);
  float a = line * uStrength * side * down;
  gl_FragColor = vec4(col * a, a);
}
`;

export function createTopography(options: TopographyOptions): TopographyHandle | null {
  const { surface } = options;
  const fadeFrom = options.fadeFrom ?? 0.6;
  const canvas = document.createElement('canvas');
  canvas.className = 'topo-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;

  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const U = {
    res: u('uRes'),
    dpr: u('uDpr'),
    mouse: u('uMouse'),
    strength: u('uStrength'),
    fade: u('uFade'),
    small: u('uSmall'),
  };
  gl.clearColor(0, 0, 0, 0);

  const coarse = window.matchMedia('(hover: none), (pointer: coarse)');
  const small = window.matchMedia('(max-width: 899px)');
  const lowPower = () => coarse.matches || small.matches;
  surface.prepend(canvas);

  let dpr = 1;
  let visible = true;
  const resize = () => {
    const w = surface.clientWidth;
    const h = surface.clientHeight;
    // desktop max 1.25, touch 1; never taller than 4096 device px
    dpr = Math.min(lowPower() ? 1 : Math.min(window.devicePixelRatio || 1, 1.25), 4096 / Math.max(1, h));
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
    draw();
  };

  const draw = () => {
    if (!visible) return;
    const h = canvas.height / dpr;
    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.dpr, dpr);
    gl.uniform3f(U.mouse, mouse.x, mouse.y, mouse.s);
    // overall visibility: about 25 % on desktop, 15 % on phones
    gl.uniform1f(U.strength, small.matches ? 0.45 : 0.55);
    gl.uniform2f(U.fade, h * fadeFrom, h);
    gl.uniform1f(U.small, small.matches ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // cursor: very gentle, slow easing; none on touch devices
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, s: 0, ts: 0 };
  let raf = 0;
  let last = 0;
  const ease = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const k = 1 - Math.exp(-dt * 1.6); // slow easing
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.s += (mouse.ts - mouse.s) * k;
    draw();
    const moving = Math.abs(mouse.tx - mouse.x) + Math.abs(mouse.ty - mouse.y) > 0.5 || Math.abs(mouse.ts - mouse.s) > 0.01;
    if (moving && visible && !document.hidden) raf = requestAnimationFrame(ease);
  };
  const wake = () => {
    if (!raf && visible && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(ease);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || lowPower() || !visible) return;
    const r = surface.getBoundingClientRect();
    mouse.tx = e.clientX - r.left;
    mouse.ty = e.clientY - r.top;
    if (mouse.x < -9000) {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
    }
    mouse.ts = 1;
    wake();
  };
  const onOut = () => {
    mouse.ts = 0;
    wake();
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onOut);
  const ro = new ResizeObserver(resize);
  ro.observe(surface);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  io.observe(surface);
  resize();
  canvas.classList.add('is-on');

  return {
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onOut);
      canvas.remove();
    },
  };
}
