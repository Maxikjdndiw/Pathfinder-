import { describe, expect, it } from 'vitest';
import { parseMarkers, visibleText } from './markers';
import { alevelToIb, COST_STEPS, defaultFilters, emptyFit, filterOffers, fitFor, OFFERS, profileToIb, type Offer } from './offers';

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
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=mode,design | stufe=jung]]').recommendation).toEqual({ felder: ['mode', 'design'], stufe: 'jung', typen: [], land: null, ids: [], sprachen: [], kosten: null });
  });
  it('reads type and country presets and ignores unknown values', () => {
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=wirtschaft | stufe=abschluss | typen=hochschule,quatsch | land=ausland]]').recommendation).toEqual({
      felder: ['wirtschaft'],
      stufe: 'abschluss',
      typen: ['hochschule'],
      land: 'ausland',
      ids: [],
      sprachen: [],
      kosten: null,
    });
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=ki | sprache=en, DE,xx]]').recommendation?.sprachen).toEqual(['en', 'de']);
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=wirtschaft | ids=bocconi-bsc, whu-bachelor,<x>]]').recommendation?.ids).toEqual(['bocconi-bsc', 'whu-bachelor']);
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=ki | land=mars]]').recommendation?.land).toBeNull();
  });
  it('reads map ids and allows the studium mode button', () => {
    const p = parseMarkers('Text\n[[KARTE: bocconi-bsc, whu-bachelor,<b>]]\n[[BUTTONS: studium:Weiter mit Studium]]');
    expect(p.map).toEqual(['bocconi-bsc', 'whu-bachelor']);
    expect(p.buttons).toEqual([{ mode: 'studium', label: 'Weiter mit Studium' }]);
    expect(p.text).toBe('Text');
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

describe('fit check', () => {
  const uni = (richtwerte?: Offer['richtwerte']): Offer => ({ ...OFFERS.find((o) => o.typ === 'hochschule')!, richtwerte });
  const abi = (note: number, faecher: string[] = []) => ({ ...emptyFit(), abschluss: 'abitur' as const, note, faecher });
  it('converts grades to IB points', () => {
    expect(profileToIb(abi(1.0))).toBe(45);
    expect(profileToIb(abi(4.0))).toBe(24);
    expect(profileToIb({ ...emptyFit(), abschluss: 'ib', ib: 33 })).toBe(33);
    expect(alevelToIb(['A', 'A*', 'A*'])).toBe(41);
    expect(alevelToIb('A*AA')).toBe(39);
    expect(alevelToIb('AAB')).toBe(36);
    expect(alevelToIb('A*BB')).toBe(34);
    expect(alevelToIb('BBC')).toBe(30);
    expect(profileToIb(emptyFit())).toBeNull();
  });
  it('rates against the guide value', () => {
    expect(fitFor(uni({ ib_punkte: 38, ib_skala: 45 }), abi(1.5))?.status).toBe('ueber'); // 41.5
    expect(fitFor(uni({ ib_punkte: 38, ib_skala: 45 }), abi(2.2))?.status).toBe('nahe'); // 36.6
    expect(fitFor(uni({ ib_punkte: 38, ib_skala: 45 }), abi(2.5))?.status).toBe('unter'); // 34.5
    // 42 scale: two points off the user's value
    expect(fitFor(uni({ ib_punkte: 38, ib_skala: 42 }), { ...emptyFit(), abschluss: 'ib', ib: 39 })?.status).toBe('nahe');
    expect(fitFor(uni(), abi(1.0))?.status).toBe('keine');
    expect(fitFor(uni({ alevel: 'AAA' }), abi(2.3))?.status).toBe('nahe'); // 35.9 vs AAA = 37
  });
  it('lists missing Higher Level subjects and leaves other offers alone', () => {
    expect(fitFor(uni({ ib_punkte: 30, hl_pflicht: ['mathe', 'naturwiss'] }), abi(2, ['mathe']))?.pflicht).toEqual(['Voraussetzung prüfen: Naturwissenschaft auf Higher Level']);
    expect(fitFor(OFFERS.find((o) => o.typ !== 'hochschule' && o.typ !== 'studiengang')!, abi(1))).toBeNull();
  });
  it('Nur Passende hides only universities below the guide value', () => {
    const f = { ...defaultFilters([], null, ['hochschule']), nurPassende: true };
    const all = filterOffers(OFFERS, { ...f, nurPassende: false }, new Date(), abi(3.5));
    const list = filterOffers(OFFERS, f, new Date(), abi(3.5));
    expect(list.length).toBeLessThan(all.length);
    expect(list.every((o) => fitFor(o, abi(3.5))?.status !== 'unter')).toBe(true);
    expect(list.some((o) => !o.richtwerte)).toBe(true);
  });
});

describe('polish: budget, competition and fit order', () => {
  const abi = (note: number) => ({ ...emptyFit(), abschluss: 'abitur' as const, note });
  it('parses kosten= and filters by the upper fee', () => {
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=wirtschaft | kosten=20.000 Euro]]').recommendation?.kosten).toBe(20000);
    expect(parseMarkers('[[EMPFEHLUNGEN: felder=wirtschaft | kosten=viel]]').recommendation?.kosten).toBeNull();
    const list = filterOffers(OFFERS, defaultFilters([], null, ['hochschule'], null, [], 20000));
    expect(list.every((o) => (o.kosten_bis_eur ?? o.kosten_pro_jahr_eur ?? 0) <= 20000)).toBe(true);
    expect(list.some((o) => o.kosten_pro_jahr_eur === null)).toBe(true);
  });
  it('low competition never shows Unter dem Richtwert; no guide value uses competition alone', () => {
    const base = OFFERS.find((o) => o.typ === 'hochschule')!;
    expect(fitFor({ ...base, richtwerte: { ib_punkte: 40 }, wettbewerb: 'niedrig' }, abi(3))?.status).toBe('gut-schwach');
    expect(fitFor({ ...base, richtwerte: { ib_punkte: 40 }, wettbewerb: 'hoch' }, abi(3))?.status).toBe('unter');
    expect(fitFor({ ...base, richtwerte: undefined, wettbewerb: 'niedrig' }, abi(3))?.status).toBe('gut');
    expect(fitFor({ ...base, richtwerte: undefined, wettbewerb: 'mittel' }, abi(3))?.status).toBe('offen');
    expect(fitFor({ ...base, richtwerte: undefined, wettbewerb: 'sehr hoch' }, abi(3))?.status).toBe('keine');
  });
  it('sorts strong fits at hard universities first, then good chances, Unter last', () => {
    const f = defaultFilters([], null, ['hochschule']);
    const list = filterOffers(OFFERS, f, new Date(), abi(1.0));
    const st = list.map((o) => fitFor(o, abi(1.0))!);
    const firstOther = st.findIndex((x) => x.status !== 'ueber' && x.status !== 'nahe');
    expect(firstOther).toBeGreaterThan(0);
    expect(st.slice(firstOther).every((x) => x.status !== 'ueber' && x.status !== 'nahe')).toBe(true);
    const order = ['sehr hoch', 'hoch', 'mittel', 'niedrig'];
    const ranks = st.slice(0, firstOther).map((x) => (x.wettbewerb ? order.indexOf(x.wettbewerb) : 4));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // without grades: unchanged order
    expect(filterOffers(OFFERS, f).map((o) => o.id)).toEqual(filterOffers(OFFERS, f, new Date(), null).map((o) => o.id));
  });
});
