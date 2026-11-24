import { describe, expect, it } from 'vitest';
import { buildSystem, cleanFields, cleanProfile } from './prompt';

describe('system prompt', () => {
  it('has a cached static block, a cached tab block and a per-student block', () => {
    const [stat, tab, dyn] = buildSystem('orientierung', { klasse: '10', felder: ['mode', 'Medizin', 'quatsch'] });
    expect(stat.cache_control).toEqual({ type: 'ephemeral' });
    expect(tab.cache_control).toEqual({ type: 'ephemeral' });
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
  it('gives each tab its own focus', () => {
    const cv = buildSystem('cv_linkedin', null)[1].text;
    const uni = buildSystem('studium', null)[1].text;
    expect(cv).toContain('<vorlagen>');
    expect(cv).toContain('LinkedIn');
    expect(cv).not.toContain('Hochschulen in der Liste');
    expect(uni).toContain('Hochschulen in der Liste');
    expect(uni).not.toContain('<vorlagen>');
    expect(buildSystem('praktika', null)[0].text).not.toContain('<vorlagen>');
  });
  it('keeps only known, short profile fields', () => {
    const p = cleanProfile({ felder: ['mode'], cv_status: 'x'.repeat(500), passwort: 'geheim', berufe: [], note: '' });
    expect(p).toEqual({ felder: ['mode'], cv_status: 'x'.repeat(200) });
    expect(cleanProfile('quatsch')).toBeNull();
    expect(buildSystem('studium', { note: 'IB 38' })[2].text).toContain('"note":"IB 38"');
  });
  it('accepts only known field ids', () => {
    expect(cleanFields(['KI', 'ki', 'hacking', 3])).toEqual(['ki']);
  });
});
