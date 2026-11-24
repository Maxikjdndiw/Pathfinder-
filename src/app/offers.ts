/**
 * Verified offers (app-data/angebote.json) and the filters for the recommendation cards.
 * The coach never invents offers: it only names fields and the stage, this file does the rest.
 */
import raw from '../../app-data/angebote.json';

export type Typ =
  | 'kurs'
  | 'sommerkurs'
  | 'praktikum'
  | 'wettbewerb'
  | 'hochschule'
  | 'studiengang'
  | 'freiwilligendienst'
  | 'simulation'
  | 'onlinekurs';
export type Stufe = 'jung' | 'mittel' | 'abschluss';

export interface Offer {
  id: string;
  typ: Typ;
  name: string;
  anbieter: string;
  felder: string[];
  stufen: Stufe[];
  land?: string;
  ort?: string;
  online?: boolean;
  kosten_pro_jahr_eur: number | null;
  kosten_label: string | null;
  zeitraum?: string;
  frist: string | null;
  link: string;
  zuletzt_geprueft: string;
  kurzbeschreibung: string;
  /** A official or the provider itself, B portal, C job portal only (check on the career page) */
  quelle_qualitaet?: string;
  /** schueler (default) or alle (online offers open to everyone) */
  zielgruppe?: 'schueler' | 'alle';
  /** de (default) or en */
  sprache?: 'de' | 'en';
  /** free text for unclear prices, for example subscriptions */
  kosten_hinweis?: string;
  /** universities: public or private */
  rechtsform?: 'oeffentlich' | 'privat';
  unterrichtssprache?: string[];
  /** upper end when the fee is a range */
  kosten_bis_eur?: number | null;
  lebenshaltung_hinweis?: string;
  studiengaenge?: string[];
  zulassung?: string;
  /** position on the world map (Studium mode) */
  lat?: number;
  lng?: number;
  /** universities: rough entry guide values (Studium fit check) */
  richtwerte?: Richtwerte;
  /** universities: how hard it is to get in */
  wettbewerb?: Wettbewerb;
}

export type Wettbewerb = 'sehr hoch' | 'hoch' | 'mittel' | 'niedrig';
/** hardest first, for the sort of strong scores */
const WETTBEWERB_RANK: Record<Wettbewerb, number> = { 'sehr hoch': 0, hoch: 1, mittel: 2, niedrig: 3 };

export interface Richtwerte {
  ib_punkte?: number;
  /** 45 (with bonus points) or 42 (without) */
  ib_skala?: 45 | 42;
  /** for example "AAA" or "A*AA" */
  alevel?: string;
  /** subjects required on Higher Level: mathe, naturwiss */
  hl_pflicht?: string[];
  hinweis?: string;
  quelle?: string;
}

/** teaching languages for the language filter (codes as in unterrichtssprache) */
export const SPRACHE_LABEL: Record<string, string> = {
  de: 'Deutsch',
  en: 'Englisch',
  es: 'Spanisch',
  it: 'Italienisch',
  fr: 'Französisch',
  nl: 'Niederländisch',
  da: 'Dänisch',
};

/** the languages of an offer: unterrichtssprache, else the older field sprache (default German) */
export const offerLanguages = (o: Offer): string[] => (o.unterrichtssprache?.length ? o.unterrichtssprache : [o.sprache ?? 'de']);

export const RECHTSFORM_LABEL: Record<'oeffentlich' | 'privat', string> = { oeffentlich: 'Öffentlich', privat: 'Privat' };

export const OFFERS = raw as Offer[];

export const TYP_LABEL: Record<Typ, string> = {
  kurs: 'Kurs',
  sommerkurs: 'Sommerkurs',
  praktikum: 'Praktikum',
  wettbewerb: 'Wettbewerb',
  hochschule: 'Hochschule',
  studiengang: 'Studiengang',
  freiwilligendienst: 'Freiwilligendienst',
  simulation: 'Simulation',
  onlinekurs: 'Onlinekurs',
};

/** Cost labels that get a coloured pill on the card; other values are not shown as a pill. */
export const COST_LABELS = ['staatlich', 'kostenpflichtig', 'kostenintensiv', 'sehr kostenintensiv'];

export const FIELD_LABEL: Record<string, string> = {
  wirtschaft: 'Wirtschaft', finanzen: 'Finanzen', beratung: 'Beratung', informatik: 'Informatik', ki: 'KI und Data Science',
  ingenieur: 'Ingenieurwesen', naturwiss: 'Naturwissenschaften', medizin: 'Medizin', gesundheit: 'Gesundheit und Pflege',
  psychologie: 'Psychologie', jura: 'Jura', politik: 'Politik', mode: 'Mode', design: 'Design', architektur: 'Architektur',
  marketing: 'Marketing', medien: 'Medien', lehramt: 'Lehramt', gruendung: 'Gründung', sport: 'Sport', diplomatie: 'Diplomatie',
  eu: 'EU-Politik', 'internationale-orgs': 'Internationale Organisationen', 'intl-business': 'International Business', sprachen: 'Sprachen',
};

export const STUFE_LABEL: Record<Stufe, string> = { jung: 'Bis Klasse 10', mittel: 'Oberstufe', abschluss: 'Letztes Schuljahr' };

/** Cost slider steps in euro per year; the last step means "50.000 or more". */
export const COST_STEPS = [0, 1000, 5000, 10000, 20000, 30000, 50000];

export interface Filters {
  felder: string[];
  stufe: Stufe | 'alle';
  /** online: international online offers (land INT) */
  land: 'alle' | 'de' | 'ausland' | 'online';
  rechtsform: 'alle' | 'oeffentlich' | 'privat';
  /** language codes; an offer matches if any of its languages is chosen (none chosen: all) */
  sprachen: string[];
  /** indexes into COST_STEPS */
  kostenMin: number;
  kostenMax: number;
  typen: Typ[];
  sort: 'frist' | 'kosten' | 'passung';
  /** hides universities "Unter dem Richtwert" (fit check), keeps "Keine Angabe" */
  nurPassende: boolean;
  /** budget from the conversation (kosten= in EMPFEHLUNGEN): highest cost per year in euro, null for none */
  budget: number | null;
}

export const defaultFilters = (
  felder: string[] = [],
  stufe: Stufe | null = null,
  typen: string[] = [],
  land: Filters['land'] | null = null,
  sprachen: string[] = [],
  budget: number | null = null,
): Filters => ({
  felder,
  stufe: stufe ?? 'alle',
  land: land ?? 'alle',
  rechtsform: 'alle',
  sprachen: sprachen.filter((c) => c in SPRACHE_LABEL),
  kostenMin: 0,
  kostenMax: COST_STEPS.length - 1,
  typen: typen.filter((t): t is Typ => t in TYP_LABEL),
  sort: 'passung',
  nurPassende: false,
  budget: budget && budget > 0 ? budget : null,
});

const matchCount = (o: Offer, felder: string[]) => o.felder.filter((f) => felder.includes(f)).length;

export function filterOffers(offers: Offer[], f: Filters, today = new Date(), fit: FitProfile | null = null): Offer[] {
  const min = COST_STEPS[f.kostenMin] ?? 0;
  const maxStep = Math.min(f.kostenMax, COST_STEPS.length - 1);
  const max = maxStep === COST_STEPS.length - 1 ? Infinity : COST_STEPS[maxStep];
  const list = offers.filter((o) => {
    if (f.felder.length && !matchCount(o, f.felder)) return false;
    if (f.stufe !== 'alle' && !o.stufen.includes(f.stufe)) return false;
    // Deutschland: DE. Online: offers that only run online. Ausland: everything else
    // (GB, US, CH, ES, IT, NL, INT and others), for example universities with several campuses
    const land = o.land ?? 'DE';
    if (f.land === 'de' && land !== 'DE') return false;
    if (f.land === 'ausland' && (land === 'DE' || o.online === true)) return false;
    if (f.land === 'online' && o.online !== true) return false;
    if (f.rechtsform !== 'alle' && o.rechtsform !== f.rechtsform) return false;
    if (f.sprachen.length && !offerLanguages(o).some((l) => f.sprachen.includes(l))) return false;
    if (f.typen.length && !f.typen.includes(o.typ)) return false;
    if (f.nurPassende && fitFor(o, fit)?.status === 'unter') return false;
    // offers without a cost figure stay visible ("Kosten unbekannt")
    if (o.kosten_pro_jahr_eur !== null && (o.kosten_pro_jahr_eur < min || o.kosten_pro_jahr_eur > max)) return false;
    // budget: the upper end of the fee (kosten_bis_eur), else the fee; offers without a figure stay
    const top = o.kosten_bis_eur ?? o.kosten_pro_jahr_eur;
    if (f.budget !== null && top !== null && top !== undefined && top > f.budget) return false;
    return true;
  });
  const deadline = (o: Offer) => {
    const t = o.frist ? Date.parse(o.frist) : NaN;
    // past or missing deadlines go to the end
    return Number.isNaN(t) || t < today.getTime() - 86400000 ? Infinity : t;
  };
  const cost = (o: Offer) => o.kosten_pro_jahr_eur ?? Infinity;
  list.sort((a, b) => {
    if (f.sort === 'frist') return deadline(a) - deadline(b) || cost(a) - cost(b);
    if (f.sort === 'kosten') return cost(a) - cost(b) || deadline(a) - deadline(b);
    return matchCount(b, f.felder) - matchCount(a, f.felder) || deadline(a) - deadline(b);
  });
  // with grades entered, "Passung" puts the fit first (stable sort keeps the order inside a group)
  if (f.sort === 'passung' && profileToIb(fit) !== null) {
    const ranks = new Map(list.map((o) => [o.id, fitRank(fitFor(o, fit))]));
    list.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  }
  return list;
}

/** Über or Nahe am Richtwert first, hardest university first (a strong score at a hard
 * university leads), then Gute Chancen, then the rest, Unter dem Richtwert last */
function fitRank(fit: Fit | null): number {
  if (!fit) return 20;
  if (fit.status === 'ueber' || fit.status === 'nahe') return fit.wettbewerb ? WETTBEWERB_RANK[fit.wettbewerb] : 4;
  if (fit.status === 'gut' || fit.status === 'gut-schwach') return 10;
  return fit.status === 'unter' ? 30 : 20;
}

export function formatEuro(n: number): string {
  return `${n.toLocaleString('de-DE')} €`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function isPast(iso: string | null, today = new Date()): boolean {
  if (!iso) return false;
  return Date.parse(`${iso}T23:59:59`) < today.getTime();
}

// ---------- fit check "Passt das?" (Studium mode, stays in this browser) ----------

export type Abschluss = 'abitur' | 'ib' | 'alevel';
export const ALEVEL_GRADES = ['A*', 'A', 'B', 'C', 'D', 'E'] as const;
export const LEISTUNGSFAECHER: Record<string, string> = {
  mathe: 'Mathe',
  naturwiss: 'Naturwissenschaft',
  wirtschaft: 'Wirtschaft',
  sprachen: 'Sprachen',
  sonstiges: 'Sonstiges',
};

export interface FitProfile {
  abschluss: Abschluss | null;
  /** Abitur grade 1.0 to 4.0 */
  note: number;
  /** IB points 24 to 45 */
  ib: number;
  /** three A-Level grades, A* to E */
  alevel: string[];
  /** Leistungskurs / Higher Level subjects (keys of LEISTUNGSFAECHER) */
  faecher: string[];
}

export const emptyFit = (): FitProfile => ({ abschluss: null, note: 2.0, ib: 34, alevel: ['A', 'A', 'B'], faecher: [] });

export type FitStatus = 'ueber' | 'nahe' | 'unter' | 'gut-schwach' | 'gut' | 'offen' | 'keine';
export const FIT_LABEL: Record<FitStatus, string> = {
  ueber: 'Über dem Richtwert',
  nahe: 'Nahe am Richtwert',
  unter: 'Unter dem Richtwert',
  'gut-schwach': 'Gute Chancen auch mit schwächerer Note',
  gut: 'Gute Chancen',
  offen: 'Offen, Voraussetzungen prüfen',
  keine: 'Keine Angabe',
};
/** flag on the card for hard universities */
export const SELEKTIV_LABEL: Partial<Record<Wettbewerb, string>> = { 'sehr hoch': 'Sehr selektiv', hoch: 'Selektiv' };

/** A-Level combinations and their IB equivalent (45 scale), best first; anything lower is 30 */
const ALEVEL_TABLE: [string[], number][] = [
  [['A*', 'A*', 'A'], 41],
  [['A*', 'A', 'A'], 39],
  [['A', 'A', 'A'], 37],
  [['A', 'A', 'B'], 36],
  [['A', 'B', 'B'], 34],
  [['B', 'B', 'B'], 32],
];
const rank = (g: string) => {
  const i = (ALEVEL_GRADES as readonly string[]).indexOf(g);
  return i < 0 ? ALEVEL_GRADES.length : i;
};
/** "A*AA" or ["A*","A","A"] to three grades, best first */
const splitAlevel = (v: string | string[]): string[] =>
  (Array.isArray(v) ? v : v.toUpperCase().match(/A\*|[A-E]/g) ?? []).slice(0, 3).sort((a, b) => rank(a) - rank(b));

export function alevelToIb(v: string | string[]): number | null {
  const g = splitAlevel(v);
  if (g.length !== 3) return null;
  // the first row the grades reach in every position
  for (const [row, ib] of ALEVEL_TABLE) if (g.every((x, i) => rank(x) <= rank(row[i]))) return ib;
  return 30;
}

/** the user's grade as IB points on the 45 scale, or null without an Abschluss */
export function profileToIb(p: FitProfile | null): number | null {
  if (!p?.abschluss) return null;
  if (p.abschluss === 'abitur') return Math.round((45 - (p.note - 1) * 7) * 10) / 10;
  if (p.abschluss === 'ib') return p.ib;
  return alevelToIb(p.alevel);
}

export interface Fit {
  status: FitStatus;
  /** second value: how hard the university is to get into (from the data) */
  wettbewerb: Wettbewerb | null;
  /** "Voraussetzung prüfen: Mathe auf Higher Level" lines */
  pflicht: string[];
}

/** rough fit of the user's grade against a university's guide value; null for non-university offers or without grades */
export function fitFor(o: Offer, p: FitProfile | null): Fit | null {
  if (o.typ !== 'hochschule' && o.typ !== 'studiengang') return null;
  const user = profileToIb(p);
  if (user === null) return null;
  const r = o.richtwerte;
  // the guide value in IB points; universities that only name A-Levels use the same table
  let need: number | null = r?.ib_punkte ?? null;
  let mine = user;
  if (need !== null && r?.ib_skala === 42) mine -= 2;
  if (need === null && r?.alevel) need = alevelToIb(r.alevel);
  const wettbewerb = o.wettbewerb ?? null;
  let status: FitStatus;
  if (need !== null) {
    status = mine >= need ? 'ueber' : mine >= need - 2 ? 'nahe' : 'unter';
    // low competition: a weaker score still has good chances, never "Unter dem Richtwert"
    if (status === 'unter' && wettbewerb === 'niedrig') status = 'gut-schwach';
  } else {
    // no guide value: competition alone
    status = wettbewerb === 'niedrig' ? 'gut' : wettbewerb === 'mittel' ? 'offen' : 'keine';
  }
  const pflicht = (r?.hl_pflicht ?? [])
    .filter((x) => !p!.faecher.includes(x))
    .map((x) => `Voraussetzung prüfen: ${LEISTUNGSFAECHER[x] ?? x} auf Higher Level`);
  return { status, wettbewerb, pflicht };
}
