/**
 * System prompt for the Pathfinder DE coach.
 * Block 1 (cached, the same for every student): coach rules, all field profiles, templates, tips.
 * Block 2 (changes per student): knowledge for the chosen fields, the profile and the mode.
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
} from './data.generated';
import { MENTORS } from '../../../src/content/mentors';

export const MODES = ['orientierung', 'cv_linkedin', 'praktika'] as const;
export type Mode = (typeof MODES)[number];

export interface Profile {
  klasse?: string;
  bundesland?: string;
  felder?: string[];
  ziel?: string;
  naechster_schritt?: string;
  stufe?: string;
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

- \`[[SYSTEM: START]]\` kommt, wenn ein Gespräch beginnt oder der Schüler einen Modus über einen Button gewechselt hat. Antworte dann mit dem Einstieg des aktuellen Modus (siehe <modus>). Erwähne die technische Nachricht nicht.
- Marker, die du selbst geschrieben hast, siehst du im Verlauf. Das Frontend hat sie ausgewertet und dem Schüler nicht gezeigt.

# Wissensblock

Stand: ${STAND}
Feld-Kennungen (für EMPFEHLUNGEN und PROFIL): ${FIELD_IDS.join(', ')}

<feldprofile>
${COST_LEGEND}

${FIELD_PROFILES}

${CROSS_NOTE}
</feldprofile>

Die geprüften Fakten zu den Feldern, die der Schüler gewählt hat, stehen weiter unten im Block <wissen>. Nur dort und in den Feldprofilen stehende Zahlen, Fristen und Programme darfst du nennen. Fehlt ein Feld im Block <wissen>, sprich allgemein und verweise auf die offizielle Seite.

<vorlagen>
${VORLAGEN}
</vorlagen>

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

export function buildSystem(mode: Mode, profile: Profile | null): Anthropic.TextBlockParam[] {
  const felder = cleanFields(profile?.felder);
  const wissen = [WISSEN_GENERAL, ...felder.map((f) => WISSEN_BY_FIELD[f]).filter(Boolean)].join('\n\n');
  const profil = profile && Object.keys(profile).length ? JSON.stringify(profile) : 'leer';
  return [
    { type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: `<wissen>\nStand: ${STAND}\n${wissen}\n</wissen>\n\n<schueler_profil>\n${profil}\n</schueler_profil>\n\n<modus>${mode}</modus>`,
    },
  ];
}
