import { describe, expect, it } from 'vitest';
import { parseMarkers, visibleText } from './markers';
import { COST_STEPS, defaultFilters, filterOffers, OFFERS } from './offers';

describe('markers', () => {
  it('reads every marker and hides it from the text', () => {
    const p = parseMarkers(
      'Hier ein paar Ideen.\n[[OPTIONEN: Mode | Wirtschaft | Keins davon, neue Vorschläge]]\n[[PROFIL: {"klasse":"10","felder":["Mode"]}]]',
    );
    expect(p.text).toBe('Hier ein paar Ideen.');
    expect(p.options).toEqual(['Mode', 'Wirtschaft', 'Keins davon, neue Vorschläge']);
    expect(p.profile).toEqual({ klasse: '10', felder: ['Mode'] });
  });
  it('reads mode buttons and drops unknown modes', () => {
    const p = parseMarkers('[[BUTTONS: cv_linkedin:Weiter mit Lebenslauf und LinkedIn | hack:Böse | praktika:Überspringen: Praktika und Sommerkurse]]');
    expect(p.buttons).toEqual([
      { mode: 'cv_linkedin', label: 'Weiter mit Lebenslauf und LinkedIn' },
      { mode: 'praktika', label: 'Überspringen: Praktika und Sommerkurse' },
    ]);
  });
  it('reads recommendations', () => {
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=mode,design | stufe=jung]]').recommendation).toEqual({ felder: ['mode', 'design'], stufe: 'jung' });
  });
  it('ignores a broken profile', () => {
    expect(parseMarkers('[[PROFIL: {kaputt]]').profile).toBeNull();
  });
  it('hides an unfinished marker while streaming', () => {
    expect(visibleText('Gute Frage.\n[[OPTIONEN: Mo')).toBe('Gute Frage.');
  });
});

describe('offers', () => {
  it('has the verified list', () => {
    expect(OFFERS.length).toBeGreaterThanOrEqual(24);
    for (const o of OFFERS) expect(o.link).toMatch(/^https?:\/\//);
  });
  it('filters by field and stage', () => {
    const list = filterOffers(OFFERS, defaultFilters(['informatik'], 'jung'));
    expect(list.length).toBeGreaterThan(0);
    for (const o of list) {
      expect(o.felder).toContain('informatik');
      expect(o.stufen).toContain('jung');
    }
  });
  it('keeps offers without costs and respects the cost range', () => {
    const f = { ...defaultFilters(['politik']), kostenMax: COST_STEPS.indexOf(1000) };
    const list = filterOffers(OFFERS, f);
    expect(list.some((o) => o.kosten_pro_jahr_eur === null)).toBe(true);
    for (const o of list) if (o.kosten_pro_jahr_eur !== null) expect(o.kosten_pro_jahr_eur).toBeLessThanOrEqual(1000);
  });
  it('splits Germany and abroad', () => {
    const abroad = filterOffers(OFFERS, { ...defaultFilters(), land: 'ausland' });
    expect(abroad.length).toBeGreaterThan(0);
    for (const o of abroad) expect(o.land).not.toBe('DE');
  });
  it('sorts by deadline with past deadlines last', () => {
    const list = filterOffers(OFFERS, { ...defaultFilters(), sort: 'frist' }, new Date('2026-11-25'));
    const first = list[0];
    expect(first.frist && Date.parse(first.frist) >= Date.parse('2026-11-25')).toBe(true);
  });
});
