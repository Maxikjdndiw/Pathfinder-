/**
 * Control markers at the end of a coach message (see app-data/prompt.md, "Steuerzeichen").
 * The frontend turns them into buttons and cards and never shows them to the student.
 */
export interface ModeButton {
  mode: 'orientierung' | 'cv_linkedin' | 'praktika';
  label: string;
}
export interface Recommendation {
  felder: string[];
  stufe: 'jung' | 'mittel' | 'abschluss' | null;
}
export interface Parsed {
  /** text without markers, safe to show */
  text: string;
  options: string[];
  buttons: ModeButton[];
  profile: Record<string, unknown> | null;
  recommendation: Recommendation | null;
  summary: string | null;
}

const MODES = new Set(['orientierung', 'cv_linkedin', 'praktika']);
const STUFEN = new Set(['jung', 'mittel', 'abschluss']);
const MARKER = /\[\[\s*(OPTIONEN|BUTTONS|PROFIL|EMPFEHLUNGEN|ZUSAMMENFASSUNG|SYSTEM)\s*:([\s\S]*?)\]\]/g;

export function parseMarkers(raw: string): Parsed {
  const out: Parsed = { text: '', options: [], buttons: [], profile: null, recommendation: null, summary: null };
  for (const m of raw.matchAll(MARKER)) {
    const kind = m[1];
    const body = m[2].trim();
    if (kind === 'OPTIONEN') {
      out.options = body.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 8);
    } else if (kind === 'BUTTONS') {
      out.buttons = body
        .split('|')
        .map((s) => {
          const i = s.indexOf(':');
          return { mode: s.slice(0, i).trim(), label: s.slice(i + 1).trim() };
        })
        .filter((b): b is ModeButton => MODES.has(b.mode) && !!b.label)
        .slice(0, 3);
    } else if (kind === 'PROFIL') {
      try {
        const p = JSON.parse(body);
        if (p && typeof p === 'object' && !Array.isArray(p)) out.profile = p;
      } catch {
        /* the coach wrote something that is not JSON: ignore it */
      }
    } else if (kind === 'EMPFEHLUNGEN') {
      const parts = Object.fromEntries(
        body.split('|').map((s) => {
          const i = s.indexOf('=');
          return [s.slice(0, i).trim().toLowerCase(), s.slice(i + 1).trim()];
        }),
      );
      const felder = String(parts.felder ?? '')
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
      const stufe = String(parts.stufe ?? '').trim().toLowerCase();
      out.recommendation = { felder, stufe: STUFEN.has(stufe) ? (stufe as Recommendation['stufe']) : null };
    } else if (kind === 'ZUSAMMENFASSUNG') {
      out.summary = body;
    }
  }
  out.text = visibleText(raw);
  return out;
}

/** Text without markers. While a reply is still streaming, an unfinished "[[" is hidden too. */
export function visibleText(raw: string): string {
  let t = raw.replace(MARKER, '');
  const open = t.lastIndexOf('[[');
  if (open >= 0 && t.indexOf(']]', open) < 0) t = t.slice(0, open);
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
