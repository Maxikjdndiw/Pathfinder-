/**
 * Control markers at the end of a coach message (see app-data/prompt.md, "Steuerzeichen").
 * The frontend turns them into buttons and cards and never shows them to the student.
 */
export interface ModeButton {
  mode: 'orientierung' | 'cv_linkedin' | 'praktika' | 'studium';
  label: string;
}
export interface Recommendation {
  felder: string[];
  stufe: 'jung' | 'mittel' | 'abschluss' | null;
  /** optional: preset the type filter, for example hochschule */
  typen: string[];
  /** optional: preset the country filter */
  land: 'de' | 'ausland' | 'online' | null;
  /** optional: exactly these offers first (the ones the coach talks about) */
  ids: string[];
  /** optional: preset the language chips, codes like de, en */
  sprachen: string[];
  /** optional: budget, highest cost in euro per year (kosten=20000) */
  kosten: number | null;
}
export interface Parsed {
  /** text without markers, safe to show */
  text: string;
  options: string[];
  buttons: ModeButton[];
  profile: Record<string, unknown> | null;
  recommendation: Recommendation | null;
  summary: string | null;
  /** [[KARTE: id1,id2]]: offer ids to highlight on the map (Studium mode) */
  map: string[] | null;
  /** [[QUELLEN: id1,id2]]: offer or content ids, shown as source chips */
  sources: string[];
  /** [[FRISTEN: id: reason | ...]]: recommended deadlines as small cards */
  deadlines: { id: string; grund: string }[];
  /** [[FRAGEN: a | b | c]]: follow-up questions to tap */
  followups: string[];
}

const MODES = new Set(['orientierung', 'cv_linkedin', 'praktika', 'studium']);
const STUFEN = new Set(['jung', 'mittel', 'abschluss']);
const TYPEN = new Set(['kurs', 'sommerkurs', 'praktikum', 'wettbewerb', 'hochschule', 'studiengang', 'freiwilligendienst', 'simulation', 'onlinekurs']);
const LAENDER = new Set(['de', 'ausland', 'online']);
const SPRACHEN = new Set(['de', 'en', 'es', 'it', 'fr', 'nl', 'da']);
const ID = /^[a-z0-9-]{2,80}$/;
const MARKER = /\[\[\s*(OPTIONEN|BUTTONS|PROFIL|EMPFEHLUNGEN|ZUSAMMENFASSUNG|KARTE|QUELLEN|FRISTEN|FRAGEN|SYSTEM)\s*:([\s\S]*?)\]\]/g;

export function parseMarkers(raw: string): Parsed {
  const out: Parsed = { text: '', options: [], buttons: [], profile: null, recommendation: null, summary: null, map: null, sources: [], deadlines: [], followups: [] };
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
      const typen = String(parts.typen ?? '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => TYPEN.has(t));
      const land = String(parts.land ?? '').trim().toLowerCase();
      out.recommendation = {
        felder,
        stufe: STUFEN.has(stufe) ? (stufe as Recommendation['stufe']) : null,
        typen,
        land: LAENDER.has(land) ? (land as Recommendation['land']) : null,
        sprachen: String(parts.sprache ?? parts.sprachen ?? '')
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter((c) => SPRACHEN.has(c)),
        ids: String(parts.ids ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter((id) => /^[a-z0-9-]{2,80}$/.test(id))
          .slice(0, 30),
        kosten: parseEuro(parts.kosten),
      };
    } else if (kind === 'KARTE') {
      out.map = body
        .split(',')
        .map((id) => id.trim())
        .filter((id) => /^[a-z0-9-]{2,80}$/.test(id))
        .slice(0, 60);
    } else if (kind === 'QUELLEN') {
      out.sources = [...new Set(body.split(',').map((id) => id.trim()).filter((id) => ID.test(id)))].slice(0, 8);
    } else if (kind === 'FRISTEN') {
      out.deadlines = body
        .split('|')
        .map((s) => {
          const i = s.indexOf(':');
          return { id: (i < 0 ? s : s.slice(0, i)).trim(), grund: i < 0 ? '' : s.slice(i + 1).trim().slice(0, 200) };
        })
        .filter((d) => ID.test(d.id))
        .slice(0, 4);
    } else if (kind === 'FRAGEN') {
      out.followups = body.split('|').map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 3);
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

/** "20000", "20.000" or "20.000 Euro" to a whole euro amount; anything odd is null */
function parseEuro(v: unknown): number | null {
  const digits = String(v ?? '').split(',')[0].replace(/[^\d]/g, '');
  const n = Number(digits);
  return digits && n > 0 && n <= 1_000_000 ? n : null;
}
