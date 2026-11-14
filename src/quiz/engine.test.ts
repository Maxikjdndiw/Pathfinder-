import { describe, expect, it } from 'vitest';
import { C1, C2, C3, C4, DILEMMAS, DILEMMA_INTRO, FIELDS, FUN_QUESTION, SETUP, TRAITS, type Metrics } from './content';
import {
  archetypeBlend,
  computeResult,
  cosine,
  maxPossibleAbs,
  normalise,
  radarValue,
  rawTraits,
  selectSentences,
  zeroTraits,
} from './engine';

/* ---------- helpers to build answer sets ---------- */

type Choice = 'a' | 'b' | 'c' | 'timeout';
function dilemmas(choices: Choice[], time: number): Metrics {
  const m: Metrics = {};
  choices.forEach((c, i) => {
    m[`d${i + 1}`] = c;
    if (c !== 'timeout') m[`d${i + 1}.time`] = time;
  });
  return m;
}
const budget = (produkt: number, marketing: number, team: number, design: number, ruecklage: number): Metrics => ({
  'c4.produkt': produkt,
  'c4.marketing': marketing,
  'c4.team': team,
  'c4.design': design,
  'c4.ruecklage': ruecklage,
});

/* ---------- normalisation ---------- */

describe('normalisation', () => {
  it('computes a positive max for every trait from the content', () => {
    const max = maxPossibleAbs();
    for (const k of TRAITS) expect(max[k]).toBeGreaterThan(0);
  });

  it('divides by the max and clamps to [-1, 1]', () => {
    const max = { ...zeroTraits(), analytic: 4, build: 2, stage: 1, risk: 5, people: 3, order: 1 };
    const raw = { ...zeroTraits(), analytic: 2, build: -4, stage: 0.5, risk: -5, people: 0, order: 9 };
    const t = normalise(raw, max);
    expect(t.analytic).toBe(0.5);
    expect(t.build).toBe(-1);
    expect(t.stage).toBe(0.5);
    expect(t.risk).toBe(-1);
    expect(t.people).toBe(0);
    expect(t.order).toBe(1);
  });

  it('keeps every real result inside [-1, 1]', () => {
    const extreme: Metrics = { 'c1.time': 3, 'c1.conf': 100, 'c1.fun': 'ja', ...budget(0, 0, 0, 0, 1), ...dilemmas(['b', 'a', 'b', 'a', 'b', 'a', 'b', 'b'], 1) };
    const t = normalise(rawTraits(extreme));
    for (const k of TRAITS) expect(Math.abs(t[k])).toBeLessThanOrEqual(1);
  });

  it('maps traits to the radar scale', () => {
    expect(radarValue(-1)).toBe(0);
    expect(radarValue(0)).toBe(50);
    expect(radarValue(1)).toBe(100);
  });
});

/* ---------- cosine ---------- */

describe('cosine similarity', () => {
  it('is 1 for the same direction, -1 for the opposite, 0 for orthogonal', () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it('is 0 for a zero vector instead of NaN', () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

/* ---------- archetype blend ---------- */

describe('archetype blend', () => {
  const random = (seed: number) => {
    let s = seed;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  };

  it('always sums to 100 in steps of 5, with 3 parts', () => {
    const r = random(42);
    for (let i = 0; i < 500; i++) {
      const t = zeroTraits();
      for (const k of TRAITS) t[k] = r();
      const blend = archetypeBlend(t);
      expect(blend).toHaveLength(3);
      expect(blend.reduce((a, b) => a + b.percent, 0)).toBe(100);
      for (const p of blend) {
        expect(p.percent % 5).toBe(0);
        expect(p.percent).toBeGreaterThanOrEqual(0);
      }
      expect(blend[0].percent).toBeGreaterThanOrEqual(blend[1].percent);
    }
  });

  it('gives the best archetype 100 % when all scores are 0', () => {
    const blend = archetypeBlend(zeroTraits());
    expect(blend[0].percent).toBe(100);
    expect(blend[1].percent + blend[2].percent).toBe(0);
  });
});

/* ---------- sentences ---------- */

describe('sentence selection', () => {
  it('picks the true templates with the highest priority and fills placeholders', () => {
    const m: Metrics = { 'c1.time': 5.2, 'c1.conf': 80, 'c1.hint': true, ...budget(0.2, 0.4, 0.2, 0.1, 0.1) };
    const s = selectSentences(m, zeroTraits());
    expect(s.map((x) => x.id)).toEqual(['c1-instinct', 'c1-hint', 'c4-marketing']);
    expect(s[0].text).toBe('Du hast in 5 Sekunden geschätzt und warst dir zu 80 % sicher. Das ist Trader Instinkt.');
    expect(s[2].text).toContain('40 % ins Marketing');
  });

  it('falls back to the strongest traits so there are always 3', () => {
    const t = { ...zeroTraits(), people: -0.9, analytic: 0.6 };
    const s = selectSentences({}, t);
    expect(s).toHaveLength(3);
    expect(s[0].text).toBe('Du bist am besten, wenn dich keiner stört.');
    expect(s[1].text).toBe('Du entscheidest mit Zahlen, nicht mit Hoffnung.');
  });

  it('uses a German decimal comma', () => {
    const s = selectSentences({ ...dilemmas(['a', 'a', 'a', 'a', 'a', 'b', 'a', 'a'], 1.44) }, zeroTraits());
    expect(s.find((x) => x.id === 'd-fast')?.text).toContain('1,4 Sekunden');
  });
});

/* ---------- no field names in questions ---------- */

describe('questions never name a field', () => {
  it('no field name appears in any question, challenge or dilemma text', () => {
    const texts: string[] = [
      SETUP.grade.question,
      SETUP.abroad.question,
      ...SETUP.abroad.options.map((o) => o.label),
      SETUP.note,
      FUN_QUESTION,
      C1.title, C1.text, C1.hint, C1.hintButton, C1.after, C1.confidenceLabel,
      C2.title, C2.text,
      ...C2.rounds.flatMap((r) => [r.kicker, r.headline, r.flawHeadline ?? '', r.body, r.button]),
      C3.title, C3.text, C3.skip,
      C4.title, C4.text,
      DILEMMA_INTRO.text,
      ...DILEMMAS.flatMap((d) => [d.prompt ?? '', ...d.options.map((o) => o.text)]),
    ];
    const haystack = texts.join('\n').toLowerCase();
    for (const f of FIELDS) expect(haystack, `field "${f.name}" appears in a question`).not.toContain(f.name.toLowerCase());
  });
});

/* ---------- simulation: 5 very different players ---------- */

const PLAYERS: Record<string, Metrics> = {
  'very risky': {
    'c1.time': 4, 'c1.conf': 90, 'c1.fun': 'ja',
    'c2.r1.result': 'wrong', 'c2.r1.time': 1.2, 'c2.r2.result': 'wrong', 'c2.r2.time': 1.5, 'c2.r3.result': 'correct', 'c2.r3.time': 6, 'c2.fun': 'nein',
    'c3.skip': true, 'c3.s1': 'skipped', 'c3.s2': 'skipped', 'c3.s3': 'skipped', 'c3.fun': 'nein',
    ...budget(0.3, 0.35, 0.2, 0.15, 0), 'c4.fun': 'ja',
    ...dilemmas(['b', 'a', 'b', 'a', 'b', 'a', 'b', 'b'], 1.2),
  },
  'very careful': {
    'c1.time': 25, 'c1.conf': 20, 'c1.hint': true, 'c1.fun': 'nein',
    'c2.r1.result': 'correct', 'c2.r1.time': 7, 'c2.r2.result': 'correct', 'c2.r2.time': 7.5, 'c2.r3.result': 'correct', 'c2.r3.time': 6.5, 'c2.fun': 'nein',
    'c3.s1': 'correct', 'c3.s2': 'correct', 'c3.s3': 'correct', 'c3.fun': 'ja',
    ...budget(0.25, 0.1, 0.2, 0.1, 0.35), 'c4.fun': 'nein',
    ...dilemmas(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'a'], 3.5),
  },
  'very creative': {
    'c1.time': 12, 'c1.conf': 50, 'c1.fun': 'nein',
    'c2.r1.result': 'correct', 'c2.r1.time': 2.5, 'c2.r2.result': 'correct', 'c2.r2.time': 2.8, 'c2.r3.result': 'correct', 'c2.r3.time': 1.9, 'c2.fun': 'ja',
    'c3.skip': true, 'c3.s1': 'skipped', 'c3.s2': 'skipped', 'c3.s3': 'skipped', 'c3.fun': 'nein',
    ...budget(0.2, 0.25, 0.1, 0.35, 0.1), 'c4.fun': 'ja',
    ...dilemmas(['b', 'a', 'b', 'a', 'b', 'c', 'a', 'b'], 2.2),
  },
  'very analytic': {
    'c1.time': 20, 'c1.conf': 60, 'c1.hint': true, 'c1.fun': 'ja',
    'c2.r1.result': 'correct', 'c2.r1.time': 8, 'c2.r2.result': 'timeout', 'c2.r3.result': 'timeout', 'c2.fun': 'nein',
    'c3.s1': 'correct', 'c3.s2': 'correct', 'c3.s3': 'correct', 'c3.fun': 'ja',
    ...budget(0.3, 0.15, 0.15, 0.1, 0.3), 'c4.fun': 'nein',
    ...dilemmas(['a', 'b', 'a', 'b', 'a', 'c', 'a', 'a'], 3),
  },
  'very social': {
    'c1.time': 10, 'c1.conf': 50, 'c1.fun': 'nein',
    'c2.r1.result': 'correct', 'c2.r1.time': 6, 'c2.r2.result': 'wrong', 'c2.r2.time': 5, 'c2.r3.result': 'timeout', 'c2.fun': 'nein',
    'c3.s1': 'correct', 'c3.skip': true, 'c3.s2': 'skipped', 'c3.s3': 'skipped', 'c3.fun': 'nein',
    ...budget(0.15, 0.3, 0.4, 0.05, 0.1), 'c4.fun': 'ja',
    ...dilemmas(['b', 'b', 'b', 'b', 'a', 'a', 'b', 'a'], 2.5),
  },
};

describe('simulation of 5 players', () => {
  it('gives different results and prints them', () => {
    const lines: string[] = [];
    const signatures = new Set<string>();
    for (const [name, metrics] of Object.entries(PLAYERS)) {
      const r = computeResult(metrics);
      signatures.add(JSON.stringify([r.blend.map((b) => [b.archetype.id, b.percent]), r.top.map((f) => f.field.id), r.wildcard.field.id]));
      const traits = TRAITS.map((k) => `${k} ${r.traits[k].toFixed(2)}`).join(', ');
      lines.push(
        `${name.padEnd(14)} | ${r.blend.map((b) => `${b.archetype.name} ${b.percent} %`).join(', ')}` +
          ` | top: ${r.top.map((f) => `${f.field.name} ${f.percent} %`).join(', ')}` +
          ` | wildcard: ${r.wildcard.field.name} ${r.wildcard.percent} %` +
          `\n${''.padEnd(14)} | traits: ${traits}` +
          `\n${''.padEnd(14)} | warum: ${r.sentences.map((s) => s.id).join(', ')}`,
      );
    }
    console.log(`\nSIMULATION\n${lines.join('\n')}\n`);
    expect(signatures.size).toBe(Object.keys(PLAYERS).length);
  });
});
