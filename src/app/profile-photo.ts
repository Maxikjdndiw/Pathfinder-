/**
 * Profile photo: choose a file, move and zoom it in a square with a round preview, save.
 * Everything happens in the browser: the photo is cropped and drawn into a 400 x 400 canvas,
 * which drops all metadata (for example the location). Only that small JPEG goes to
 * /api/profilbild, under the student's own code. It is never sent to the AI.
 */
const OUT = 400;
const MAX_FILE = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface PhotoApi {
  /** current photo as data URL, or null */
  current: string | null;
  save(dataUrl: string): Promise<void>;
  remove(): Promise<void>;
  /** after a successful save or delete */
  onChange(dataUrl: string | null): void;
}

let dialog: HTMLDialogElement | null = null;

export function openPhotoDialog(api: PhotoApi): void {
  dialog?.remove();
  dialog = document.createElement('dialog');
  dialog.className = 'mentor pp';
  dialog.setAttribute('aria-labelledby', 'pp-title');
  dialog.innerHTML = `
    <h2 id="pp-title">Profilbild</h2>
    <p>Freiwillig. Nur du siehst dein Foto, es geht nicht an die KI. Ohne Foto zeigen wir deine Initialen.</p>
    <div class="pp__stage" data-stage tabindex="0" aria-label="Bildausschnitt. Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen." hidden>
      <img alt="" data-img draggable="false" />
    </div>
    <div class="pp__empty" data-empty>Noch kein Foto ausgewählt.</div>
    <label class="pp__zoom" data-zoom-wrap hidden><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1" data-zoom /></label>
    <p class="form-error" data-err role="alert"></p>
    <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" data-file tabindex="-1" aria-hidden="true" />
    <div class="pp__actions">
      <button type="button" class="btn btn--quiet btn--small" data-pick>${api.current ? 'Anderes Foto' : 'Foto auswählen'}</button>
      ${api.current ? '<button type="button" class="btn btn--quiet btn--small pp__del" data-del>Foto löschen</button>' : ''}
      <span class="pp__spacer"></span>
      <button type="button" class="btn btn--quiet btn--small" data-cancel>Abbrechen</button>
      <button type="button" class="btn btn--solid btn--small" data-save disabled>Speichern</button>
    </div>`;
  document.body.append(dialog);
  const d = dialog;
  const $ = <T extends Element>(s: string) => d.querySelector<T>(s)!;
  const stage = $<HTMLElement>('[data-stage]');
  const img = $<HTMLImageElement>('[data-img]');
  const zoom = $<HTMLInputElement>('[data-zoom]');
  const err = $<HTMLElement>('[data-err]');
  const saveBtn = $<HTMLButtonElement>('[data-save]');
  const fileInput = $<HTMLInputElement>('[data-file]');

  // image state: natural size, zoom, and the offset of the image centre from the stage centre
  let source: ImageBitmap | HTMLImageElement | null = null;
  let w = 0;
  let h = 0;
  let z = 1;
  let cx = 0;
  let cy = 0;
  const size = () => stage.clientWidth || 280;
  const cover = () => Math.max(size() / w, size() / h);
  function clamp() {
    const s = size();
    const dw = w * cover() * z;
    const dh = h * cover() * z;
    cx = Math.max(-(dw - s) / 2, Math.min((dw - s) / 2, cx));
    cy = Math.max(-(dh - s) / 2, Math.min((dh - s) / 2, cy));
  }
  function draw() {
    if (!source) return;
    clamp();
    const k = cover() * z;
    img.style.width = `${w * k}px`;
    img.style.height = `${h * k}px`;
    img.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
    zoom.value = String(z);
  }
  function show(src: string, bitmap: ImageBitmap | HTMLImageElement, bw: number, bh: number, fresh: boolean) {
    source = bitmap;
    w = bw;
    h = bh;
    z = 1;
    cx = 0;
    cy = 0;
    img.src = src;
    stage.hidden = false;
    $<HTMLElement>('[data-zoom-wrap]').hidden = false;
    $<HTMLElement>('[data-empty]').hidden = true;
    saveBtn.disabled = !fresh;
    requestAnimationFrame(draw);
  }

  // the saved photo can be moved and zoomed again
  if (api.current) {
    const el = new Image();
    el.onload = () => show(api.current!, el, el.naturalWidth, el.naturalHeight, false);
    el.src = api.current;
  }

  $<HTMLButtonElement>('[data-pick]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    err.textContent = '';
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return void (err.textContent = 'Bitte wähle ein Foto als JPG, PNG oder WebP.');
    if (file.size > MAX_FILE) return void (err.textContent = 'Das Foto ist zu groß. Höchstens 10 MB, bitte wähle ein kleineres.');
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width < 100 || bitmap.height < 100) return void (err.textContent = 'Das Foto ist zu klein. Es sollte mindestens 100 x 100 Pixel haben.');
      show(URL.createObjectURL(file), bitmap, bitmap.width, bitmap.height, true);
    } catch {
      err.textContent = 'Das Foto ließ sich nicht öffnen. Bitte versuche ein anderes.';
    }
  });

  const changed = () => {
    saveBtn.disabled = false;
    draw();
  };
  zoom.addEventListener('input', () => {
    z = Number(zoom.value);
    changed();
  });
  // move with mouse or finger, zoom with two fingers or the mouse wheel
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y) / z;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      z = Math.max(1, Math.min(4, Math.hypot(a.x - b.x, a.y - b.y) / pinch));
    } else {
      cx += e.clientX - prev.x;
      cy += e.clientY - prev.y;
    }
    changed();
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      z = Math.max(1, Math.min(4, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      changed();
    },
    { passive: false },
  );
  stage.addEventListener('keydown', (e) => {
    const step = 10;
    if (e.key === 'ArrowLeft') cx += step;
    else if (e.key === 'ArrowRight') cx -= step;
    else if (e.key === 'ArrowUp') cy += step;
    else if (e.key === 'ArrowDown') cy -= step;
    else if (e.key === '+' || e.key === '=') z = Math.min(4, z * 1.08);
    else if (e.key === '-') z = Math.max(1, z / 1.08);
    else return;
    e.preventDefault();
    changed();
  });

  saveBtn.addEventListener('click', async () => {
    if (!source) return;
    err.textContent = '';
    saveBtn.disabled = true;
    try {
      // the visible square, drawn at 400 x 400: a new image without any metadata
      const s = size();
      const k = (cover() * z * OUT) / s;
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.imageSmoothingQuality = 'high';
      const dw = w * k;
      const dh = h * k;
      ctx.drawImage(source, OUT / 2 + (cx * OUT) / s - dw / 2, OUT / 2 + (cy * OUT) / s - dh / 2, dw, dh);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      await api.save(dataUrl);
      api.onChange(dataUrl);
      d.close();
    } catch (x) {
      err.textContent = (x as Error).message || 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
      saveBtn.disabled = false;
    }
  });
  d.querySelector<HTMLButtonElement>('[data-del]')?.addEventListener('click', async () => {
    if (!confirm('Dein Profilbild löschen?')) return;
    try {
      await api.remove();
      api.onChange(null);
      d.close();
    } catch (x) {
      err.textContent = (x as Error).message || 'Das hat nicht geklappt.';
    }
  });
  $<HTMLButtonElement>('[data-cancel]').addEventListener('click', () => d.close());
  d.addEventListener('close', () => d.remove());
  d.showModal();
}
