/**
 * Netzwerk sphere: a draggable sphere of image tiles that snaps the nearest tile to the
 * front and shows its title and description. Written for this site in plain TypeScript
 * with the Three.js already used by the hero (same lazy chunk).
 *
 * Inspired by the React Bits "Infinite Menu" component (https://reactbits.dev),
 * Copyright (c) 2026 David Haz, MIT + Commons Clause License Condition v1.0.
 * Used as part of this website only; not for resale or redistribution as a component.
 *
 * Interaction:
 * - mouse: drag in any direction, inertia, then the nearest tile snaps forward
 * - touch: a swipe that starts vertically scrolls the page (touch-action: pan-y), so the
 *   page is never trapped; once a drag has started sideways, the finger turns the sphere
 *   in every direction, up and down too
 * - prev / next buttons and the arrow keys step through the 14 topics
 * - renders only while something moves and the sphere is on screen
 */
import {
  CanvasTexture,
  Group,
  LinearSRGBColorSpace,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { NetworkTile } from '../data/networkTiles';

export interface SphereHandle {
  destroy(): void;
}

export interface SphereOptions {
  tiles: NetworkTile[];
  /** called whenever the front tile changes (and with moving=true while dragging) */
  onActive: (tile: NetworkTile, moving: boolean) => void;
}

const SLOTS = 42; // each of the 14 tiles appears 3 times, spread over the sphere
const RADIUS = 2;
const TILE = 0.7;
const TEX = 384;
const PITCH_LIMIT = MathUtils.degToRad(70);

function fibonacciSphere(n: number): Vector3[] {
  const pts: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    // half-step offset and a 0.78 band: no tile sits on a pole, so every tile can be
    // turned to the front within the pitch limit
    const y = (1 - ((i + 0.5) / n) * 2) * 0.78;
    const r = Math.sqrt(1 - y * y);
    const a = golden * i;
    pts.push(new Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return pts;
}

/** rounded-square texture of the tile image; stays a calm colour block until the image loads */
function tileTexture(url: string, onReady: () => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  const clip = () => {
    ctx.beginPath();
    ctx.roundRect(0, 0, TEX, TEX, TEX * 0.16);
    ctx.clip();
  };
  ctx.save();
  clip();
  ctx.fillStyle = '#D2D2D7';
  ctx.fillRect(0, 0, TEX, TEX);
  ctx.restore();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  tex.anisotropy = 4;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    ctx.clearRect(0, 0, TEX, TEX);
    ctx.save();
    clip();
    const s = Math.max(TEX / img.naturalWidth, TEX / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (TEX - w) / 2, (TEX - h) / 2, w, h);
    ctx.restore();
    tex.needsUpdate = true;
    onReady();
  };
  img.src = url;
  return tex;
}

export function createSphere(host: HTMLElement, opts: SphereOptions): SphereHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'pan-y';
  host.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 8.2);
  const ball = new Group();
  scene.add(ball);

  const geometry = new PlaneGeometry(TILE, TILE);
  const base = import.meta.env.BASE_URL;
  const textures = new Map<string, CanvasTexture>();
  const textureFor = (t: NetworkTile) => {
    let tex = textures.get(t.id);
    if (!tex) {
      tex = tileTexture(`${base}${t.image}`, wake);
      textures.set(t.id, tex);
    }
    return tex;
  };

  interface Slot {
    mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
    dir: Vector3;
    tile: NetworkTile;
    index: number;
  }
  const slots: Slot[] = fibonacciSphere(SLOTS).map((dir, i) => {
    const tileIndex = i % opts.tiles.length;
    const tile = opts.tiles[tileIndex];
    const mat = new MeshBasicMaterial({ map: textureFor(tile), transparent: true, depthWrite: false });
    const mesh = new Mesh(geometry, mat);
    mesh.position.copy(dir).multiplyScalar(RADIUS);
    mesh.lookAt(dir.clone().multiplyScalar(RADIUS * 2)); // face outwards, stay upright
    ball.add(mesh);
    return { mesh, dir, tile, index: tileIndex };
  });

  /* ---------- rotation state: yaw around Y, then pitch around X ---------- */
  let yaw = 0;
  let pitch = 0;
  let vYaw = 0;
  let vPitch = 0;
  let target: { yaw: number; pitch: number } | null = null;
  let dragging = false;
  let activeSlot: Slot | null = null;
  let moving = false;

  const applyRotation = () => {
    ball.rotation.set(0, 0, 0);
    ball.rotateX(pitch);
    ball.rotateY(yaw);
  };

  /** yaw/pitch that bring a slot's direction to the front (+z), nearest to the current yaw */
  const anglesFor = (s: Slot) => {
    const d = s.dir;
    let ty = Math.atan2(-d.x, d.z);
    const tp = MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -PITCH_LIMIT, PITCH_LIMIT);
    ty += Math.round((yaw - ty) / (Math.PI * 2)) * Math.PI * 2;
    return { yaw: ty, pitch: tp };
  };

  const world = new Vector3();
  const frontSlot = () => {
    let best = slots[0];
    let bestZ = -Infinity;
    for (const s of slots) {
      s.mesh.getWorldPosition(world);
      if (world.z > bestZ) {
        bestZ = world.z;
        best = s;
      }
    }
    return best;
  };

  const setActive = (s: Slot, isMoving: boolean) => {
    if (s !== activeSlot || isMoving !== moving) {
      activeSlot = s;
      moving = isMoving;
      opts.onActive(s.tile, isMoving);
    }
  };

  /* ---------- size ---------- */
  const resize = () => {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole sphere visible on narrow screens; on wide ones leave room for the caption
    camera.position.z = w < h ? 8.2 / Math.max(camera.aspect, 0.62) : 9.6;
    camera.updateProjectionMatrix();
    wake();
  };

  /* ---------- loop ---------- */
  let raf = 0;
  let last = 0;
  let visible = true;
  const tmp = new Vector3();

  function wake() {
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(now: number) {
    raf = 0;
    // rAF timestamps can be slightly earlier than performance.now() at wake(): never go negative
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    let busy = dragging;

    if (!dragging) {
      if (target) {
        // critically damped approach to the snap target
        const k = 1 - Math.exp(-dt * 9);
        yaw += (target.yaw - yaw) * k;
        pitch += (target.pitch - pitch) * k;
        if (Math.abs(target.yaw - yaw) < 0.0005 && Math.abs(target.pitch - pitch) < 0.0005) {
          yaw = target.yaw;
          pitch = target.pitch;
          target = null;
        } else busy = true;
      } else if (Math.abs(vYaw) > 0.05 || Math.abs(vPitch) > 0.05) {
        // inertia after a fling
        yaw += vYaw * dt;
        pitch = MathUtils.clamp(pitch + vPitch * dt, -PITCH_LIMIT, PITCH_LIMIT);
        const decay = Math.exp(-dt * 3.2);
        vYaw *= decay;
        vPitch *= decay;
        busy = true;
      } else if (vYaw !== 0 || vPitch !== 0) {
        vYaw = 0;
        vPitch = 0;
        applyRotation();
        ball.updateMatrixWorld(true);
        target = anglesFor(frontSlot());
        busy = true;
      }
    }
    applyRotation();
    ball.updateMatrixWorld(true);

    // tiles facing away fade back; tiles shrink a little while the sphere moves
    const isMoving = dragging || target !== null || Math.abs(vYaw) + Math.abs(vPitch) > 0.05;
    const front = frontSlot();
    for (const s of slots) {
      s.mesh.getWorldPosition(tmp);
      const facing = tmp.z / RADIUS; // -1 back, 1 front
      const op = MathUtils.smoothstep(facing, -0.35, 0.55);
      s.mesh.material.opacity = 0.12 + 0.88 * op;
      const targetScale = isMoving ? 0.88 : s === front ? 1.12 : 1;
      s.mesh.scale.setScalar(MathUtils.lerp(s.mesh.scale.x, targetScale, 1 - Math.exp(-dt * 10)));
      if (Math.abs(s.mesh.scale.x - targetScale) > 0.002) busy = true;
      s.mesh.renderOrder = Math.round(facing * 100);
    }
    setActive(front, isMoving);
    renderer.render(scene, camera);
    if (busy && visible) raf = requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */
  let drag: { id: number; x: number; y: number; t: number; touch: boolean; locked: 'h' | 'v' | null } | null = null;
  const speed = () => 3.2 / Math.max(host.clientWidth, 1);

  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse', locked: null };
    vYaw = 0;
    vPitch = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < 6) return;
      // touch: a mostly vertical gesture belongs to the page scroll
      if (drag.touch && Math.abs(dy) > Math.abs(dx)) {
        drag = null;
        return;
      }
      dragging = true;
      target = null;
      canvas.setPointerCapture?.(e.pointerId);
      canvas.style.cursor = 'grabbing';
    }
    const now = performance.now();
    const dtm = Math.max(0.008, (now - drag.t) / 1000);
    const dYaw = dx * speed();
    const dPitch = dy * speed();
    yaw += dYaw;
    pitch = MathUtils.clamp(pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
    vYaw = MathUtils.lerp(vYaw, dYaw / dtm, 0.5);
    vPitch = MathUtils.lerp(vPitch, dPitch / dtm, 0.5);
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = now;
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';
    canvas.releasePointerCapture?.(e.pointerId);
    // a slow release snaps right away; a fling coasts first
    if (Math.hypot(vYaw, vPitch) < 0.6) {
      vYaw = 0;
      vPitch = 0;
      applyRotation();
      ball.updateMatrixWorld(true);
      target = anglesFor(frontSlot());
    }
    wake();
  };

  /** step to the previous/next topic: the nearest slot that shows it */
  const step = (dir: 1 | -1) => {
    const current = activeSlot ?? frontSlot();
    const want = (current.index + dir + opts.tiles.length) % opts.tiles.length;
    let best: Slot | null = null;
    let bestCost = Infinity;
    for (const s of slots) {
      if (s.index !== want) continue;
      const a = anglesFor(s);
      const cost = Math.abs(a.yaw - yaw) + Math.abs(a.pitch - pitch);
      if (cost < bestCost) {
        bestCost = cost;
        best = s;
      }
    }
    if (best) {
      vYaw = 0;
      vPitch = 0;
      target = anglesFor(best);
      wake();
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  });
  io.observe(host);

  // start with the first topic in front
  const first = slots.filter((s) => s.index === 0).sort((p, q) => Math.abs(p.dir.y) - Math.abs(q.dir.y))[0];
  const a0 = anglesFor(first);
  yaw = a0.yaw - 0.9;
  pitch = a0.pitch;
  target = a0;
  resize();

  return Object.assign(
    {
      destroy() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        for (const s of slots) s.mesh.material.dispose();
        for (const t of textures.values()) t.dispose();
        geometry.dispose();
        renderer.dispose();
        canvas.remove();
      },
    },
    { prev: () => step(-1), next: () => step(1) },
  );
}

export type SphereControls = SphereHandle & { prev(): void; next(): void };
