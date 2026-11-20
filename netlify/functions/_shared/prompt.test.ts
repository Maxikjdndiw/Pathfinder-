import { describe, expect, it } from 'vitest';
import { buildSystem, cleanFields } from './prompt';

describe('system prompt', () => {
  it('has a cached static block and a per-student block', () => {
    const [stat, dyn] = buildSystem('orientierung', { klasse: '10', felder: ['mode', 'Medizin', 'quatsch'] });
    expect(stat.cache_control).toEqual({ type: 'ephemeral' });
    expect(dyn.cache_control).toBeUndefined();
    expect(stat.text).toContain('Du bist der Pathfinder-Coach');
    expect(stat.text).toContain('Simone Simoncelli');
    // no template placeholders from the draft left over
    expect(stat.text).not.toMatch(/\[(Datum eintragen|hier eintragen|Vorlage einfügen|einfügen)\]/);
    expect(dyn.text).toContain('<modus>orientierung</modus>');
    expect(dyn.text).toContain('Feld "mode"');
    expect(dyn.text).toContain('Feld "medizin"');
    expect(dyn.text).not.toContain('Feld "jura"');
  });
  it('keeps the static block identical for every student (cache hits)', () => {
    expect(buildSystem('praktika', null)[0].text).toBe(buildSystem('orientierung', { felder: ['ki'] })[0].text);
  });
  it('accepts only known field ids', () => {
    expect(cleanFields(['KI', 'ki', 'hacking', 3])).toEqual(['ki']);
  });
});
