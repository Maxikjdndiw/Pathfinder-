/**
 * The Pathfinder card scene.
 *
 * Dozens of tilted cards (each one a possible path) fly in, swirl into a ring
 * around the headline, settle into a tilted wall and finally line up like a
 * road into the distance. `state.s` is driven by the scroll position:
 *   0 = ring, 1 = wall, 2 = road, > 2 = travelling down the road.
 *
 * This module is loaded lazily (dynamic import) so the first screen never waits for Three.js.
 */
import {
  Timer,
  Euler,
  MathUtils,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  CanvasTexture,
  LinearSRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CARDS, type PathCard } from './content/cards';

export interface SceneState {
  /** scroll driven stage, see file header */
  s: number;
}

export interface SceneHandle {
  dispose(): void;
}

const COLORS = {
  card: '#F4F2EE',
  line: '#CFCDC7',
  ink: '#141517',
  oxbloodDark: '#5F0F0C',
  oxbloodLight: '#741714',
  ocean: '#096996',
  oceanLight: '#6FA3BE',
};

const CARD_W = 1.5;
const CARD_H = 2.0;
const FOV = 35;
const CAM_Z = 14;

const DISPLAY_FONT = '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif';
const BODY_FONT = 'Inter, system-ui, sans-serif';

/* ------------------------------------------------------------------ */
/* Card textures, generated in code                                   */
/* ------------------------------------------------------------------ */

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const clean = word.replace(/­/g, '');
    const test = line ? `${line} ${clean}` : clean;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      // a single word that is still too wide: break it at its soft hyphen
      if (!line && ctx.measureText(clean).width > maxWidth && word.includes('­')) {
        const [a, ...rest] = word.split('­');
        lines.push(`${a}-`);
        line = rest.join('');
      } else {
        line = test;
      }
    } else {
      lines.push(line);
      if (ctx.measureText(clean).width > maxWidth && word.includes('­')) {
        const [a, ...rest] = word.split('­');
        lines.push(`${a}-`);
        line = rest.join('');
      } else {
        line = clean;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(
  canvas: HTMLCanvasElement,
  card: PathCard,
  index: number,
  image?: HTMLImageElement,
): void {
  const W = canvas.width;
  const H = canvas.height;
  const k = W / 512; // design at 512px wide, scale for smaller textures
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const r = 34 * k;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, r);
  ctx.clip();

  // background
  let text = COLORS.card;
  if (image) {
    const s = Math.max(W / image.width, H / image.height);
    const iw = image.width * s;
    const ih = image.height * s;
    ctx.drawImage(image, (W - iw) / 2, (H - ih) / 2, iw, ih);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, 'rgba(20,21,23,0.72)');
    shade.addColorStop(0.55, 'rgba(20,21,23,0.25)');
    shade.addColorStop(1, 'rgba(20,21,23,0.05)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
  } else if (card.variant === 'oxblood') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.oxbloodDark);
    g.addColorStop(1, COLORS.oxbloodLight);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (card.variant === 'ocean') {
    // keep the top (where the text is) dark enough for contrast
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COLORS.ocean);
    g.addColorStop(0.45, COLORS.ocean);
    g.addColorStop(1, COLORS.oceanLight);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (card.variant === 'ink') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d1e21');
    g.addColorStop(1, COLORS.ink);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = COLORS.card;
    ctx.fillRect(0, 0, W, H);
    text = COLORS.ink;
  }

  // faint top highlight, like light on a printed card
  const hl = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  hl.addColorStop(0, 'rgba(255,255,255,0.10)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(0, 0, W, H);

  const pad = 40 * k;
  ctx.fillStyle = text;
  ctx.textBaseline = 'alphabetic';

  // kind label
  ctx.globalAlpha = 0.78;
  ctx.font = `500 ${21 * k}px ${BODY_FONT}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${2.2 * k}px`;
  ctx.fillText(card.kind.toUpperCase(), pad, pad + 20 * k);
  const num = String(index + 1).padStart(2, '0');
  const numW = ctx.measureText(num).width;
  ctx.fillText(num, W - pad - numW, pad + 20 * k);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.globalAlpha = 1;

  // title
  let size = 74 * k;
  ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
  let lines = wrapText(ctx, card.title, W - pad * 2);
  while (lines.length > 3 || lines.some((l) => ctx.measureText(l).width > W - pad * 2)) {
    size -= 4 * k;
    ctx.font = `700 ${size}px ${DISPLAY_FONT}`;
    lines = wrapText(ctx, card.title, W - pad * 2);
    if (size < 36 * k) break;
  }
  let y = pad + 20 * k + 56 * k + size * 0.8;
  for (const l of lines) {
    ctx.fillText(l, pad, y);
    y += size * 0.98;
  }

  // detail
  ctx.font = `400 ${27 * k}px ${BODY_FONT}`;
  ctx.globalAlpha = 0.9;
  y += 10 * k;
  for (const l of wrapText(ctx, card.detail, W - pad * 2)) {
    ctx.fillText(l, pad, y);
    y += 36 * k;
  }
  ctx.globalAlpha = 1;

  // bottom: a thin path line with an arrow
  const by = H - pad - 4 * k;
  ctx.strokeStyle = text;
  ctx.globalAlpha = card.variant === 'ocean' ? 0.95 : 0.55;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(pad, by);
  ctx.lineTo(W - pad - 30 * k, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - pad - 44 * k, by - 12 * k);
  ctx.lineTo(W - pad - 30 * k, by);
  ctx.lineTo(W - pad - 44 * k, by + 12 * k);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();

  // hairline border on light cards
  if (card.variant === 'card' && !image) {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.roundRect(1.5 * k, 1.5 * k, W - 3 * k, H - 3 * k, r);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/* Shader: card texture with chromatic blur on fast moving cards      */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec2 uOff;      // chromatic offset in uv space, follows screen velocity
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec4 c  = texture2D(map, vUv);
    vec4 r1 = texture2D(map, vUv + uOff);
    vec4 r2 = texture2D(map, vUv + uOff * 0.5);
    vec4 b1 = texture2D(map, vUv - uOff);
    vec4 b2 = texture2D(map, vUv - uOff * 0.5);
    vec4 r = (r1 + r2) * 0.5;
    vec4 b = (b1 + b2) * 0.5;
    // texture is premultiplied, so mixing channels keeps edges clean
    vec4 col = vec4(r.r, (c.g * 2.0 + r2.g + b2.g) * 0.25, b.b, (r.a + c.a * 2.0 + b.a) * 0.25);
    col *= uOpacity;
    if (col.a < 0.004) discard;
    gl_FragColor = col;
  }
`;

/* ------------------------------------------------------------------ */
/* Formations                                                         */
/* ------------------------------------------------------------------ */

interface Pose {
  p: Vector3;
  q: Quaternion;
}

const tmpE = new Euler();
const quatFrom = (x: number, y: number, z: number) => new Quaternion().setFromEuler(tmpE.set(x, y, z));

function rand(seed: number): () => number {
  // small deterministic PRNG so the layout is the same on every visit
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ */
/* Scene                                                              */
/* ------------------------------------------------------------------ */

export async function createScene(container: HTMLElement, state: SceneState): Promise<SceneHandle> {
  const isSmall = window.matchMedia('(max-width: 760px)').matches;
  const count = Math.min(CARDS.length, isSmall ? 20 : 34);
  const texW = isSmall ? 320 : 512;
  const texH = Math.round(texW * (CARD_H / CARD_W));

  // make sure the brand fonts are ready before we paint them into textures
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 64px ${DISPLAY_FONT}`),
        document.fonts.load(`400 24px ${BODY_FONT}`),
        document.fonts.load(`500 24px ${BODY_FONT}`),
      ]),
      new Promise((res) => setTimeout(res, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  // colours are painted as sRGB into the canvas textures and passed through untouched
  renderer.outputColorSpace = LinearSRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, CAM_Z);

  const geometry = new PlaneGeometry(CARD_W, CARD_H);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const random = rand(7);

  interface CardObj {
    mesh: Mesh<PlaneGeometry, ShaderMaterial>;
    delay: number; // stagger for transitions
    introDelay: number;
    spin: number;
    jitter: number;
    scatter: Pose;
    prevNdc: Vector2;
    vel: Vector2;
    hasPrev: boolean;
  }

  const cards: CardObj[] = [];
  for (let i = 0; i < count; i++) {
    const data = CARDS[i];
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = texH;
    drawCard(canvas, data, i);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = NoColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = Math.min(8, maxAniso);
    tex.generateMipmaps = true;

    if (data.image) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        drawCard(canvas, data, i, img);
        tex.needsUpdate = true;
      };
      img.src = `${import.meta.env.BASE_URL}${data.image.replace(/^\//, '')}`;
    }

    const material = new ShaderMaterial({
      uniforms: {
        map: { value: tex },
        uOff: { value: new Vector2() },
        uOpacity: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: true,
      side: 2, // DoubleSide
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    const spread = 1.6;
    cards.push({
      mesh,
      delay: random(),
      introDelay: random() * 0.6 + i * 0.012,
      spin: (random() - 0.5) * 2,
      jitter: (random() - 0.5) * 0.5,
      scatter: {
        p: new Vector3((random() - 0.5) * 30 * spread, (random() - 0.5) * 20 * spread, -40 + random() * 30),
        q: quatFrom(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2),
      },
      prevNdc: new Vector2(),
      vel: new Vector2(),
      hasPrev: false,
    });
  }

  /* ----- viewport ----- */
  let width = 1;
  let height = 1;
  let visW = 1;
  let visH = 1;
  const resize = () => {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    visH = 2 * CAM_Z * Math.tan(MathUtils.degToRad(FOV / 2));
    visW = visH * camera.aspect;
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ----- formations (computed per frame, they are cheap) ----- */
  const ringPose = (i: number, time: number, out: Pose) => {
    const n = count;
    const a = (i / n) * Math.PI * 2 + time * 0.045;
    const portrait = camera.aspect < 0.9;
    const rx = portrait ? visW * 0.66 : Math.max(visW * 0.54, 5);
    const ry = portrait ? visH * 0.5 : visH * 0.56;
    const depth = Math.sin(a * 3 + i) * 1.2 - 1.2;
    out.p.set(Math.cos(a) * rx, Math.sin(a) * ry, depth);
    out.q.setFromEuler(tmpE.set(Math.sin(a) * 0.35, -Math.cos(a) * 0.55, a * 0.18 + cards[i].jitter));
  };

  const wallGroupQ = quatFrom(0.12, -0.42, 0.05);
  const wallPose = (i: number, time: number, out: Pose) => {
    const cols = isSmall || camera.aspect < 0.9 ? 4 : 7;
    const rows = Math.ceil(count / cols);
    const c = i % cols;
    const r = Math.floor(i / cols);
    const gx = 1.72;
    const gy = 2.24;
    const local = new Vector3(
      (c - (cols - 1) / 2) * gx + (r % 2) * 0.3,
      ((rows - 1) / 2 - r) * gy,
      Math.sin(time * 0.6 + i) * 0.08,
    );
    local.applyQuaternion(wallGroupQ);
    const portrait = camera.aspect < 0.9;
    out.p.copy(local).add(new Vector3(portrait ? -0.2 : 1.2, 0.1, portrait ? -9 : -6));
    out.q.copy(wallGroupQ).multiply(quatFrom(0, 0, cards[i].jitter * 0.12));
  };

  const ROAD_STEP = 2.5;
  const roadPose = (i: number, travel: number, out: Pose): number => {
    const lane = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const rows = Math.ceil(count / 2);
    const length = rows * ROAD_STEP;
    const zFront = 9;
    let z = zFront - row * ROAD_STEP + travel;
    // wrap so the road never runs out
    z = zFront - ((((zFront - z) % length) + length) % length);
    const curve = Math.sin(z * 0.06) * 1.2; // the road gently bends
    out.p.set(lane * 0.95 + curve, -1.75, z);
    out.q.setFromEuler(tmpE.set(-1.18, 0, lane * 0.04 + cards[i].jitter * 0.1));
    // fade in far away, fade out just before passing the camera
    const far = clamp01((z + length - ROAD_STEP * 1.5) / (ROAD_STEP * 3));
    const near = 1 - clamp01((z - (zFront - 1.5)) / 1.5);
    return Math.min(far, near);
  };

  /* ----- pointer parallax ----- */
  const pointer = new Vector2();
  const onPointer = (e: PointerEvent) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  /* ----- loop ----- */
  const clock = new Timer();
  const a: Pose = { p: new Vector3(), q: new Quaternion() };
  const b: Pose = { p: new Vector3(), q: new Quaternion() };
  const res: Pose = { p: new Vector3(), q: new Quaternion() };
  const ndc = new Vector3();
  const lookTarget = new Vector3();
  const spinQ = new Quaternion();
  let introStart = -1;
  let running = false;
  let raf = 0;
  let visible = true;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsed();
    if (introStart < 0) introStart = time;
    const intro = time - introStart;

    const s = Math.max(0, state.s);
    const travel = Math.max(0, s - 2) * 14;
    const roadMix = smooth(clamp01(s - 1));

    // camera: gentle pointer parallax, lowers and looks down the road at the end
    const camX = pointer.x * 0.55;
    const camY = -pointer.y * 0.35 + roadMix * 0.9;
    camera.position.x += (camX - camera.position.x) * 0.05;
    camera.position.y += (camY - camera.position.y) * 0.05;
    lookTarget.set(0, -roadMix * 1.1, -roadMix * 8);
    camera.lookAt(lookTarget);
    camera.updateMatrixWorld();

    for (let i = 0; i < count; i++) {
      const card = cards[i];
      let opacity = 1;

      // which two formations are we between?
      let t: number;
      if (s <= 1) {
        ringPose(i, time, a);
        wallPose(i, time, b);
        t = s;
      } else {
        wallPose(i, time, a);
        opacity = MathUtils.lerp(1, roadPose(i, travel, b), smooth(clamp01((s - 1) * 1.6 - card.delay * 0.4)));
        t = Math.min(1, s - 1);
      }
      const local = smooth(clamp01((t - card.delay * 0.35) / 0.65));
      res.p.lerpVectors(a.p, b.p, local);
      res.q.slerpQuaternions(a.q, b.q, local);

      // flight arc: cards lift towards the camera and spin while they travel
      const arc = Math.sin(local * Math.PI);
      res.p.z += arc * 2.6;
      res.p.y += arc * card.spin * 0.6;
      spinQ.setFromEuler(tmpE.set(arc * card.spin * 0.5, 0, arc * card.spin * 0.9));
      res.q.multiply(spinQ);

      // intro: fly in from a random scatter
      const it = easeOutCubic(clamp01((intro - card.introDelay) / 1.7));
      if (it < 1) {
        res.p.lerpVectors(card.scatter.p, res.p, it);
        res.q.slerpQuaternions(card.scatter.q, res.q, it);
        opacity *= clamp01(it * 2.5);
      }

      const m = card.mesh;
      m.position.copy(res.p);
      m.quaternion.copy(res.q);

      // screen-space velocity → chromatic blur
      ndc.copy(res.p).project(camera);
      if (card.hasPrev && dt > 0) {
        const vx = (ndc.x - card.prevNdc.x) / dt;
        const vy = (ndc.y - card.prevNdc.y) / dt;
        card.vel.x += (vx - card.vel.x) * 0.25;
        card.vel.y += (vy - card.vel.y) * 0.25;
      }
      card.prevNdc.set(ndc.x, ndc.y);
      card.hasPrev = true;
      const off = m.material.uniforms.uOff.value as Vector2;
      off.set(card.vel.x * 0.006, card.vel.y * 0.006);
      const len = off.length();
      if (len > 0.022) off.multiplyScalar(0.022 / len);
      if (len < 0.0015) off.set(0, 0);

      m.material.uniforms.uOpacity.value = opacity;
      m.visible = opacity > 0.01;
    }

    renderer.render(scene, camera);
  };

  const start = () => {
    if (running) return;
    running = true;
    clock.update(); // don't jump after a pause
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // only render while the hero is on screen and the tab is visible
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    },
    { rootMargin: '100px' },
  );
  io.observe(container);
  const onVis = () => (document.hidden || !visible ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  renderer.domElement.style.opacity = '0';
  renderer.domElement.style.transition = 'opacity 0.8s ease';
  requestAnimationFrame(() => (renderer.domElement.style.opacity = '1'));
  start();

  return {
    dispose() {
      stop();
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVis);
      for (const c of cards) {
        (c.mesh.material.uniforms.map.value as CanvasTexture).dispose();
        c.mesh.material.dispose();
      }
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
