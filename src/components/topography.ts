/**
 * Topography: a landscape drawn in fine contour lines that rises gently under the cursor.
 * Vanilla TypeScript take on the React Bits "Topography" background (https://reactbits.dev,
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0), recoloured for
 * the light stone theme: no glow, no click pulse. Used as part of this website only.
 *
 * One small fragment shader on plain WebGL (no Three.js, so the first screen stays light).
 * The canvas is fixed to the viewport; the field is drawn in page coordinates, so the lines
 * scroll with the content. It covers the "surface" element (hero + "Für wen") and fades out
 * at its end. Lines are stronger on the right and fade towards the left.
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
uniform float uScroll;  // viewport top in surface coordinates (css px)
uniform float uTime;
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
  // css px, page coordinates relative to the surface
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 page = vec2(css.x, css.y + uScroll);
  vec2 p = page / 460.0;
  float t = uTime * 0.012;
  float h = fbm(p + vec2(t, t * 0.6));
  // the land rises gently under the cursor
  vec2 d = (page - uMouse.xy) / 260.0;
  h += uMouse.z * 0.11 * exp(-dot(d, d));

  float levels = 26.0;
  float v = h * levels;
  float fw = max(fwidth(v), 1e-4);
  float dist = abs(fract(v - 0.5) - 0.5) / fw;          // distance to the nearest line in px-ish units
  float line = 1.0 - smoothstep(0.35 * uDpr, 1.1 * uDpr, dist);
  float major = 1.0 - step(0.5, mod(floor(v + 0.5), 5.0));  // every fifth line slightly darker
  vec3 light = vec3(0.812, 0.804, 0.780);   // #CFCDC7
  vec3 dark = vec3(0.725, 0.718, 0.694);    // #B9B7B1
  vec3 col = mix(light, dark, major);

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
    scroll: u('uScroll'),
    time: u('uTime'),
    mouse: u('uMouse'),
    strength: u('uStrength'),
    fade: u('uFade'),
    small: u('uSmall'),
  };
  gl.clearColor(0, 0, 0, 0);
  document.body.prepend(canvas);

  const coarse = window.matchMedia('(hover: none), (pointer: coarse)');
  const small = window.matchMedia('(max-width: 899px)');
  const lowPower = () => coarse.matches || small.matches;
  let dpr = 1;
  const resize = () => {
    // max 1.5; phones render at 1 (the lines are very faint there, so it costs nothing visible)
    dpr = lowPower() ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    dirty = true;
  };

  // cursor: very gentle, slow easing; none on touch devices
  const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, s: 0, ts: 0 };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || lowPower()) return;
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

  // Redraw only when something changed: scroll, size, the eased cursor, or the slow drift.
  // The drift is so slow that a few frames a second look continuous.
  let raf = 0;
  let last = 0;
  let drawnAt = -1e9;
  let lastScroll = NaN;
  let time = 0;
  let visible = true;
  let dirty = true;
  const frame = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    const k = 1 - Math.exp(-dt * 1.6); // slow easing
    mouse.x += (mouse.tx - mouse.x) * k;
    mouse.y += (mouse.ty - mouse.y) * k;
    mouse.s += (mouse.ts - mouse.s) * k;
    const easing = Math.abs(mouse.tx - mouse.x) + Math.abs(mouse.ty - mouse.y) > 0.5 || Math.abs(mouse.ts - mouse.s) > 0.01;
    const r = surface.getBoundingClientRect();
    const scrolled = r.top !== lastScroll;
    const driftEvery = lowPower() ? 250 : 100;
    if (dirty || scrolled || (easing && now - drawnAt > 16) || now - drawnAt > driftEvery) {
      dirty = false;
      lastScroll = r.top;
      drawnAt = now;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.dpr, dpr);
      gl.uniform1f(U.scroll, -r.top);
      gl.uniform1f(U.time, time);
      gl.uniform3f(U.mouse, mouse.x, mouse.y, mouse.s);
      // overall visibility: about 25 % on desktop, 15 % on phones
      gl.uniform1f(U.strength, small.matches ? 0.3 : 0.55);
      gl.uniform2f(U.fade, r.height * fadeFrom, r.height);
      gl.uniform1f(U.small, small.matches ? 1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    raf = requestAnimationFrame(frame);
  };
  function wake() {
    if (!raf && visible && !document.hidden) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onOut);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    canvas.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) wake();
  });
  io.observe(surface);
  const onVis = () => wake();
  document.addEventListener('visibilitychange', onVis);
  canvas.classList.add('is-on');
  wake();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onOut);
      document.removeEventListener('visibilitychange', onVis);
      canvas.remove();
    },
  };
}
