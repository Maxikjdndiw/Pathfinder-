/**
 * System prompt for the Pathfinder DE coach.
 * Block 1 (cached, the same for every student and tab): coach rules, field profiles, offers, tips.
 * Block 2 (cached, one per tab): the tab's focus, for example the CV templates or the universities.
 * Block 3 (changes per student): knowledge for the chosen fields and the shared profile.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  COST_LEGEND,
  CROSS_NOTE,
  FIELD_IDS,
  FIELD_PROFILES,
  PROMPT_CORE,
  TIPPS_ALLGEMEIN,
  VORLAGEN,
  WISSEN_BY_FIELD,
  WISSEN_GENERAL,
  WISSEN_STUDIUM,
  HOCHSCHUL_LISTE,
  ANGEBOTS_INDEX,
} from './data.generated';
import { MENTORS } from '../../../src/content/mentors';

export const MODES = ['orientierung', 'cv_linkedin', 'praktika', 'studium'] as const;
export type Mode = (typeof MODES)[number];

/** One profile per access code, shared by all four tabs (stored in the student's browser). */
export interface Profile {
  klasse?: string;
  bundesland?: string;
  interessen?: string[];
  felder?: string[];
  note?: string;
  berufe?: string[];
  cv_status?: string;
  ziel?: string;
  naechster_schritt?: string;
  stufe?: string;
}
const PROFILE_TEXT = ['klasse', 'bundesland', 'note', 'cv_status', 'ziel', 'naechster_schritt', 'stufe'] as const;
const PROFILE_LIST = ['interessen', 'felder', 'berufe'] as const;

/** Only the known profile fields, short, so a tampered browser cannot blow up the prompt. */
export function cleanProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_TEXT) if (typeof r[k] === 'string' || typeof r[k] === 'number') out[k] = String(r[k]).trim().slice(0, 200);
  for (const k of PROFILE_LIST)
    if (Array.isArray(r[k])) out[k] = (r[k] as unknown[]).map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  for (const k of Object.keys(out)) if (out[k] === '' || (Array.isArray(out[k]) && !(out[k] as unknown[]).length)) delete out[k];
  return Object.keys(out).length ? (out as Profile) : null;
}

const STAND = '20.11.2026';

/** Tips from professionals: personal opinion of the named person, never of their employer. */
function mentorTips(): string {
  return MENTORS.map(
    (m) => `- ${m.name} (${m.role}), Freigabe liegt vor: ja. Stichpunkte: ${m.tips.map((t) => `"${t}"`).join(', ')} (persönliche Meinung)`,
  ).join('\n');
}

const STATIC_PROMPT = `${PROMPT_CORE}

# Technische Nachrichten des Frontends

- \`[[SYSTEM: START]]\` kommt, wenn der Schüler einen Tab zum ersten Mal öffnet. Antworte mit dem Einstieg dieses Modus (siehe <modus>) und knüpfe an das <schueler_profil> an, statt Bekanntes neu zu fragen. Erwähne die technische Nachricht nicht.
- Marker, die du selbst geschrieben hast, siehst du im Verlauf. Das Frontend hat sie ausgewertet und dem Schüler nicht gezeigt.

# Wissensblock

Stand: ${STAND}
Feld-Kennungen (für EMPFEHLUNGEN und PROFIL): ${FIELD_IDS.join(', ')}

<angebote>
Alle Angebote der geprüften Liste (Kennung | Name | Typ | Land). Nur diese Kennungen gibt es, zum Beispiel für ids= und KARTE:
${ANGEBOTS_INDEX}
</angebote>

<feldprofile>
${COST_LEGEND}

${FIELD_PROFILES}

${CROSS_NOTE}
</feldprofile>

Die geprüften Fakten zu den Feldern, die der Schüler gewählt hat, stehen weiter unten im Block <wissen>. Nur dort und in den Feldprofilen stehende Zahlen, Fristen und Programme darfst du nennen. Fehlt ein Feld im Block <wissen>, sprich allgemein und verweise auf die offizielle Seite.

<tipps>
${TIPPS_ALLGEMEIN}

Tipps von Menschen aus der Praxis (nur als persönliche Meinung der Person weitergeben):
${mentorTips()}
</tipps>`;

/** Only known field ids, at most six, so the dynamic block stays small. */
export function cleanFields(felder: unknown): string[] {
  if (!Array.isArray(felder)) return [];
  const known = new Set<string>(FIELD_IDS);
  return [...new Set(felder.map((f) => String(f).toLowerCase().trim()).filter((f) => known.has(f)))].slice(0, 6);
}

const TAB_NOTE =
  'Jeder Tab hat seinen eigenen Verlauf. Du siehst nur den Verlauf dieses Tabs. Was in den anderen Tabs passiert ist, steht im <schueler_profil>.';

/** The focus of each tab: what this chat is for and the material it works with. */
const TAB_FOCUS: Record<Mode, string> = {
  orientierung: `<tab_fokus modus="orientierung">
${TAB_NOTE}
Fokus: Interessen und Felder entdecken. Halte Interessen, Felder und Berufe, die der Schüler gewählt hat, mit [[PROFIL]] fest, damit die anderen Tabs sie kennen.
</tab_fokus>`,
  cv_linkedin: `<tab_fokus modus="cv_linkedin">
${TAB_NOTE}
Fokus: Lebenslauf, Portfolio und LinkedIn. Arbeite mit den Vorlagen und der LinkedIn-Anleitung unten und mit den Feldern aus dem Profil. Halte den Stand mit [[PROFIL]] in "cv_status" fest (zum Beispiel "Entwurf Schule und Engagement fertig").

<vorlagen>
${VORLAGEN}
</vorlagen>
</tab_fokus>`,
  praktika: `<tab_fokus modus="praktika">
${TAB_NOTE}
Fokus: Praktika, Sommerkurse, Wettbewerbe und Bewerbungen dafür, passend zu Feldern und Stufe aus dem Profil. Nutze die Angebotsliste.
</tab_fokus>`,
  studium: `<tab_fokus modus="studium">
${TAB_NOTE}
Fokus: Hochschulen und Studienwege. Nutze den Studium-Block und die Hochschulliste. Hält der Schüler eine Note fest, setze sie mit [[PROFIL]] in "note".

${WISSEN_STUDIUM}

Hochschulen in der Liste (id | Name | Land, Ort | Rechtsform | Kosten | Felder):
${HOCHSCHUL_LISTE}
</tab_fokus>`,
};

export function buildSystem(mode: Mode, profile: Profile | null): Anthropic.TextBlockParam[] {
  const clean = cleanProfile(profile);
  const felder = cleanFields(clean?.felder);
  const wissen = [WISSEN_GENERAL, ...felder.map((f) => WISSEN_BY_FIELD[f]).filter(Boolean)].join('\n\n');
  const profil = clean ? JSON.stringify(clean) : 'leer';
  return [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: TAB_FOCUS[mode], cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: `<wissen>\nStand: ${STAND}\n${wissen}\n</wissen>\n\n<schueler_profil>\n${profil}\n</schueler_profil>\n\n<modus>${mode}</modus>`,
    },
  ];
}
