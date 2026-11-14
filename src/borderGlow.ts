/**
 * BorderGlow – ported from the React Bits <BorderGlow /> component (https://reactbits.dev)
 * as a plain function that upgrades existing elements instead of wrapping them.
 * Near the edge, a coloured mesh-gradient border, a soft fill and an outer glow follow
 * the pointer's direction.
 *
 * Pathfinder changes: brand colours by default, and the coloured border is drawn as a
 * masked ring, so translucent (glass) cards keep their own background.
 */
import './styles/borderGlow.css';

export interface BorderGlowOptions {
  edgeSensitivity?: number;
  /** "H S L" values, e.g. "199 89 31" */
  glowColor?: string;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  fillOpacity?: number;
  colors?: string[];
}

function parseHSL(hslStr: string) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function glowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars: Record<string, string> = {};
  opacities.forEach((o, i) => (vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(o * intensity, 100)}%)`));
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function gradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[`--bg-g${i + 1}`] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--bg-gbase'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

export function initBorderGlow(elements: Iterable<HTMLElement>, opts: BorderGlowOptions = {}): void {
  const o = {
    edgeSensitivity: 8, // starts glowing soon after the pointer leaves the centre
    glowColor: '199 89 31', // ocean
    glowRadius: 44,
    glowIntensity: 1.5,
    coneSpread: 25,
    fillOpacity: 0.55,
    colors: ['#6A1311', '#096996', '#6FA3BE'], // oxblood, ocean, ocean-light
    ...opts,
  };
  const vars = {
    '--edge-sensitivity': String(o.edgeSensitivity),
    '--glow-padding': `${o.glowRadius}px`,
    '--cone-spread': String(o.coneSpread),
    '--fill-opacity': String(o.fillOpacity),
    ...glowVars(o.glowColor, o.glowIntensity),
    ...gradientVars(o.colors),
  };

  for (const el of elements) {
    if (el.classList.contains('bglow')) continue;
    el.classList.add('bglow');
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    el.style.setProperty('--bglow-radius', getComputedStyle(el).borderTopLeftRadius);

    const cone = document.createElement('span');
    cone.className = 'bglow__layer bglow__cone';
    cone.innerHTML = '<span class="bglow__ring"></span>';
    const fill = document.createElement('span');
    fill.className = 'bglow__layer bglow__fill';
    const light = document.createElement('span');
    light.className = 'bglow__layer bglow__light';
    for (const layer of [cone, fill, light]) {
      layer.setAttribute('aria-hidden', 'true');
      el.prepend(layer);
    }

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const cx = r.width / 2;
      const cy = r.height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const kx = dx !== 0 ? cx / Math.abs(dx) : Infinity;
      const ky = dy !== 0 ? cy / Math.abs(dy) : Infinity;
      const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
      let angle = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      el.style.setProperty('--edge-proximity', (edge * 100).toFixed(3));
      el.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
    });
  }
}
