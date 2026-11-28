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
  it('A: quotes only the approved wording, with name and role', () => {
    const stat = buildSystem('orientierung', null)[0].text;
    expect(stat).toContain('Simone Simoncelli, Associate bei BlackRock. Feld: Finance. Freigabe liegt vor: ja.');
    expect(stat).toContain('"In Networking investieren"');
    expect(stat).toContain('"Wir wollen den Menschen hinter der Bewerbung kennenlernen."');
    expect(stat).toContain('Nicht kürzen, nicht umschreiben');
  });
  it('B: offers reach the model with deadline, costs, link and check date', () => {
    const stat = buildSystem('praktika', null)[0].text;
    expect(stat).toMatch(/jugend-forscht-2027 \| .*Frist: 2026-11-30 \| Kosten: .* \| Link: https:\/\/\S+ \| geprüft: 2026-11-20/);
    expect(stat).toContain('Dazu habe ich keine geprüfte Information.');
    // field facts arrive for the fields in the profile
    expect(buildSystem('praktika', { felder: ['informatik'] })[2].text).toContain('Feld "informatik"');
  });
  it('C and D: the CV tab knows the three Word templates and the LinkedIn guide', () => {
    const cv = buildSystem('cv_linkedin', null)[1].text;
    for (const t of ['<cv_vorlagen>', 'DAS MACHT MICH AUS', 'SIMULATIONEN, KURSE UND ZERTIFIKATE', 'WETTBEWERBE UND AUSZEICHNUNGEN', '<linkedin_anleitung>', 'Lizenzen und Zertifikate', 'erst ab 16 Jahren']) expect(cv).toContain(t);
    expect(buildSystem('studium', null)[1].text).not.toContain('<linkedin_anleitung>');
    expect(buildSystem('cv_linkedin', null)[0].text).toContain('Codeblock');
  });
  it('Ergänzung 28.11.: each tab gets only its own new sections', () => {
    const stat = buildSystem('orientierung', null)[0].text;
    const tab = (m: Parameters<typeof buildSystem>[0]) => buildSystem(m, null)[1].text;
    expect(tab('orientierung')).toContain('Check-U');
    expect(tab('studium')).toContain('Nachweise bis 20.01.2027');
    expect(tab('studium')).toContain('13 Begabtenförderungswerke');
    expect(tab('studium')).toContain('KMK-Vereinbarung');
    expect(tab('praktika')).toContain('vom Verbot der Kinderarbeit ausgenommen');
    expect(tab('cv_linkedin')).toContain('Körpergröße und Wunschberuf');
    expect(tab('cv_linkedin')).toContain('Quelle (Auszug');
    for (const m of ['orientierung', 'praktika', 'cv_linkedin'] as const) expect(tab(m)).not.toContain('BAföG gibt es');
    expect(tab('studium')).not.toContain('Check-U');
    expect(stat).not.toContain('Check-U');
    expect(stat).not.toContain('Jugendarbeitsschutz');
    // Jugend forscht details only with a matching field
    expect(buildSystem('praktika', { felder: ['informatik'] })[2].text).toContain('Arbeitswelt, Biologie, Chemie');
    expect(buildSystem('praktika', { felder: ['mode'] })[2].text).not.toContain('Arbeitswelt, Biologie, Chemie');
    // date and rules
    expect(buildSystem('praktika', null)[2].text).toMatch(/<heute>\d{4}-\d{2}-\d{2}<\/heute>/);
    expect(stat).toContain('Termine nennst du immer mit Jahr');
    // contradicting statements were not added
    expect(JSON.stringify(buildSystem('studium', { felder: ['informatik'] }))).not.toContain('hier noch keine Termine nennen');
    expect(JSON.stringify(buildSystem('studium', { felder: ['informatik'] }))).not.toContain('jüngere mindestens in Klasse 4');
  });
  it('accepts only known field ids', () => {
    expect(cleanFields(['KI', 'ki', 'hacking', 3])).toEqual(['ki']);
  });
});
