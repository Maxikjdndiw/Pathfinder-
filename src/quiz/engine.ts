/**
 * Pathfinder Run engine: pure functions, no DOM, no storage, no network.
 * Input: the metrics the interface recorded. Output: traits, fields, archetype blend, sentences.
 */
import {
  ARCHETYPES,
  CHALLENGE_TITLES,
  DILEMMAS,
  FIELDS,
  SCORE_GROUPS,
  SENTENCES,
  TRAITS,
  TRAIT_SENTENCES,
  type Archetype,
  type Cond,
  type Effects,
  type Field,
  type Metrics,
  type ScoreGroup,
  type Trait,
} from './content';

export type TraitVector = Record<Trait, number>;

export const zeroTraits = (): TraitVector => ({ analytic: 0, build: 0, stage: 0, risk: 0, people: 0, order: 0 });
export const toArray = (t: TraitVector): number[] => TRAITS.map((k) => t[k]);

/* ---------- conditions ---------- */

export function holds(c: Cond, m: Metrics): boolean {
  const v = m[c.m];
  if (v === undefined) return false;
  if (c.eq !== undefined && v !== c.eq) return false;
  if (typeof v === 'number') {
    if (c.lt !== undefined && !(v < c.lt)) return false;
    if (c.lte !== undefined && !(v <= c.lte)) return false;
    if (c.gt !== undefined && !(v > c.gt)) return false;
    if (c.gte !== undefined && !(v >= c.gte)) return false;
  } else if (c.lt !== undefined || c.lte !== undefined || c.gt !== undefined || c.gte !== undefined) {
    return false;
  }
  return true;
}

export const allHold = (conds: Cond[], m: Metrics) => conds.every((c) => holds(c, m));

/* ---------- derived metrics ---------- */

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Adds the metrics that are computed from others (counts, averages, flags). */
export function deriveMetrics(input: Metrics, groups: ScoreGroup[] = SCORE_GROUPS): Metrics {
  const m: Metrics = { ...input };

  // C2: correct answers and their average time
  const correctTimes: number[] = [];
  for (const r of [1, 2, 3]) {
    if (m[`c2.r${r}.result`] === 'correct' && typeof m[`c2.r${r}.time`] === 'number') correctTimes.push(m[`c2.r${r}.time`] as number);
  }
  m['c2.correct'] = correctTimes.length;
  if (correctTimes.length) m['c2.avgCorrectTime'] = mean(correctTimes);

  // C3: correct sequences
  m['c3.correct'] = [1, 2, 3].filter((s) => m[`c3.s${s}`] === 'correct').length;

  // C4: all five shares between 15 % and 25 %
  const keys = ['produkt', 'marketing', 'team', 'design', 'ruecklage'];
  const shares = keys.map((k) => m[`c4.${k}`]);
  if (shares.every((s) => typeof s === 'number')) {
    m['c4.balanced'] = (shares as number[]).every((s) => s >= 0.15 - 1e-9 && s <= 0.25 + 1e-9);
  }

  // Dilemmas: timeouts and average decision time
  const answered: number[] = [];
  let timeouts = 0;
  for (const d of DILEMMAS) {
    const choice = m[d.id];
    if (choice === 'timeout') timeouts++;
    else if (typeof m[`${d.id}.time`] === 'number' && choice !== undefined) answered.push(m[`${d.id}.time`] as number);
  }
  m['d.timeouts'] = timeouts;
  m['d.allAnswered'] = answered.length === DILEMMAS.length;
  if (answered.length) m['d.avgTime'] = mean(answered);

  // "Ja" on the challenge with the highest trait gain and "Nein" on another one
  const gain: Record<string, number> = {};
  for (const g of groups) {
    if (g.source === 'dilemmas' || g.id.endsWith('.fun')) continue;
    const o = g.outcomes.find((x) => allHold(x.when, m));
    if (!o) continue;
    gain[g.source] = (gain[g.source] ?? 0) + Object.values(o.effects).reduce((a, b) => a + Math.abs(b ?? 0), 0);
  }
  const challenges = (['c1', 'c2', 'c3', 'c4'] as const).filter((c) => m[`${c}.fun`] !== undefined);
  const best = [...challenges].sort((a, b) => (gain[b] ?? 0) - (gain[a] ?? 0))[0];
  const other = challenges.find((c) => c !== best && m[`${c}.fun`] === 'nein');
  if (best && m[`${best}.fun`] === 'ja' && other) {
    m['fun.contrast'] = true;
    m['fun.best'] = CHALLENGE_TITLES[best];
    m['fun.other'] = CHALLENGE_TITLES[other];
  }
  return m;
}

/* ---------- traits ---------- */

const addEffects = (t: TraitVector, e: Effects) => {
  for (const k of TRAITS) t[k] += e[k] ?? 0;
};

/** Raw trait points: the first matching outcome of every group. */
export function rawTraits(metrics: Metrics, groups: ScoreGroup[] = SCORE_GROUPS): TraitVector {
  const m = deriveMetrics(metrics, groups);
  const t = zeroTraits();
  for (const g of groups) {
    const o = g.outcomes.find((x) => allHold(x.when, m));
    if (o) addEffects(t, o.effects);
  }
  return t;
}

/**
 * Largest absolute raw value each trait can reach, computed from the groups:
 * the best possible outcome per group, summed, in the positive and in the negative
 * direction (an outcome-less result counts as 0).
 */
export function maxPossibleAbs(groups: ScoreGroup[] = SCORE_GROUPS): TraitVector {
  const out = zeroTraits();
  for (const k of TRAITS) {
    let pos = 0;
    let neg = 0;
    for (const g of groups) {
      const vals = [0, ...g.outcomes.map((o) => o.effects[k] ?? 0)];
      pos += Math.max(...vals);
      neg += -Math.min(...vals);
    }
    out[k] = Math.max(pos, neg);
  }
  return out;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** value = raw / maxPossibleAbs, clamped to [-1, 1] */
export function normalise(raw: TraitVector, max: TraitVector = maxPossibleAbs()): TraitVector {
  const t = zeroTraits();
  for (const k of TRAITS) t[k] = max[k] > 0 ? clamp(raw[k] / max[k], -1, 1) : 0;
  return t;
}

/** radar display = (value + 1) * 50 */
export const radarValue = (v: number) => (v + 1) * 50;

/* ---------- matching ---------- */

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export interface FieldMatch {
  field: Field;
  similarity: number;
  percent: number;
}

export const matchPercent = (sim: number) => clamp(Math.round(60 + 38 * sim), 35, 98);

export function matchFields(t: TraitVector, fields: Field[] = FIELDS): { top: FieldMatch[]; wildcard: FieldMatch } {
  const v = toArray(t);
  const scored = fields.map((field) => {
    const similarity = cosine(v, field.vector);
    return { field, similarity, percent: matchPercent(similarity) };
  });
  const byBest = (a: FieldMatch, b: FieldMatch) => b.similarity - a.similarity;
  const top = scored.filter((s) => s.field.kind === 'main').sort(byBest).slice(0, 2);
  const wildcard = scored.filter((s) => s.field.kind === 'wildcard').sort(byBest)[0];
  return { top, wildcard };
}

export interface BlendPart {
  archetype: Archetype;
  percent: number;
}

/**
 * Score = max(0, cosine)^2. Top 3, as percentages of their sum, rounded to steps of 5;
 * the largest absorbs the rounding so the total is exactly 100 (without dropping below the next).
 * If all scores are 0, the best archetype gets 100 %.
 */
export function archetypeBlend(t: TraitVector, archetypes: Archetype[] = ARCHETYPES): BlendPart[] {
  const v = toArray(t);
  const scored = archetypes
    .map((archetype) => {
      const sim = cosine(v, archetype.vector);
      return { archetype, sim, score: Math.max(0, sim) ** 2 };
    })
    .sort((a, b) => b.score - a.score || b.sim - a.sim);
  const top = scored.slice(0, 3);
  const sum = top.reduce((a, b) => a + b.score, 0);
  if (sum === 0) {
    return top.map((s, i) => ({ archetype: s.archetype, percent: i === 0 ? 100 : 0 }));
  }
  const parts = top.map((s) => ({ archetype: s.archetype, percent: Math.round(((s.score / sum) * 100) / 5) * 5 }));
  let diff = 100 - parts.reduce((a, b) => a + b.percent, 0);
  // The largest absorbs the rounding. When it has to give points back, it never drops below
  // the next part (e.g. 34/33/33 rounds to 35/35/35; taking 5 from the first would make the
  // main archetype the smallest), so the next part gives them instead.
  while (diff !== 0) {
    if (diff > 0) {
      parts[0].percent += 5;
      diff -= 5;
    } else {
      const i = parts.findIndex((p, k) => p.percent - 5 >= (parts[k + 1]?.percent ?? 0));
      parts[i === -1 ? parts.length - 1 : i].percent -= 5;
      diff += 5;
    }
  }
  return parts;
}

/* ---------- sentences ---------- */

const fmt = (v: unknown, kind: 'int' | 'dec1' | 'pct' | 'text'): string => {
  if (kind === 'text') return String(v);
  const n = Number(v);
  if (kind === 'pct') return String(Math.round(n * 100));
  if (kind === 'dec1') return (Math.round(n * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return String(Math.round(n));
};

export function fillTemplate(text: string, vars: Record<string, { m: string; fmt: 'int' | 'dec1' | 'pct' | 'text' }> | undefined, m: Metrics): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (all, key: string) => (vars[key] ? fmt(m[vars[key].m], vars[key].fmt) : all));
}

/**
 * The 3 true templates with the highest priority. If fewer than 3 hold, the rest is
 * filled with the fallback sentences of the strongest traits (so always 3, at least 2).
 */
export function selectSentences(metrics: Metrics, t: TraitVector, count = 3): { id: string; text: string }[] {
  const m = deriveMetrics(metrics);
  const picked = SENTENCES.filter((s) => allHold(s.when, m))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, count)
    .map((s) => ({ id: s.id, text: fillTemplate(s.text, s.vars, m) }));
  const traits = [...TRAITS].sort((a, b) => Math.abs(t[b]) - Math.abs(t[a]));
  for (const k of traits) {
    if (picked.length >= count) break;
    const plus = t[k] >= 0;
    picked.push({ id: `trait-${k}-${plus ? 'plus' : 'minus'}`, text: TRAIT_SENTENCES[k][plus ? 'plus' : 'minus'] });
  }
  return picked;
}

/* ---------- everything together ---------- */

export interface QuizResult {
  traits: TraitVector;
  raw: TraitVector;
  blend: BlendPart[];
  top: FieldMatch[];
  wildcard: FieldMatch;
  sentences: { id: string; text: string }[];
}

export function computeResult(metrics: Metrics): QuizResult {
  const raw = rawTraits(metrics);
  const traits = normalise(raw);
  const { top, wildcard } = matchFields(traits);
  return { raw, traits, blend: archetypeBlend(traits), top, wildcard, sentences: selectSentences(metrics, traits) };
}
