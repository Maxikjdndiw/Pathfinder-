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
}

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
  /** indexes into COST_STEPS */
  kostenMin: number;
  kostenMax: number;
  typen: Typ[];
  sort: 'frist' | 'kosten' | 'passung';
}

export const defaultFilters = (felder: string[] = [], stufe: Stufe | null = null): Filters => ({
  felder,
  stufe: stufe ?? 'alle',
  land: 'alle',
  kostenMin: 0,
  kostenMax: COST_STEPS.length - 1,
  typen: [],
  sort: 'passung',
});

const matchCount = (o: Offer, felder: string[]) => o.felder.filter((f) => felder.includes(f)).length;

export function filterOffers(offers: Offer[], f: Filters, today = new Date()): Offer[] {
  const min = COST_STEPS[f.kostenMin] ?? 0;
  const maxStep = Math.min(f.kostenMax, COST_STEPS.length - 1);
  const max = maxStep === COST_STEPS.length - 1 ? Infinity : COST_STEPS[maxStep];
  const list = offers.filter((o) => {
    if (f.felder.length && !matchCount(o, f.felder)) return false;
    if (f.stufe !== 'alle' && !o.stufen.includes(f.stufe)) return false;
    const land = o.land ?? 'DE';
    if (f.land === 'de' && land !== 'DE') return false;
    if (f.land === 'ausland' && (land === 'DE' || land === 'INT')) return false;
    if (f.land === 'online' && land !== 'INT') return false;
    if (f.typen.length && !f.typen.includes(o.typ)) return false;
    // offers without a cost figure stay visible ("Kosten unbekannt")
    if (o.kosten_pro_jahr_eur !== null && (o.kosten_pro_jahr_eur < min || o.kosten_pro_jahr_eur > max)) return false;
    return true;
  });
  const deadline = (o: Offer) => {
    const t = o.frist ? Date.parse(o.frist) : NaN;
    // past or missing deadlines go to the end
    return Number.isNaN(t) || t < today.getTime() - 86400000 ? Infinity : t;
  };
  const cost = (o: Offer) => o.kosten_pro_jahr_eur ?? Infinity;
  return list.sort((a, b) => {
    if (f.sort === 'frist') return deadline(a) - deadline(b) || cost(a) - cost(b);
    if (f.sort === 'kosten') return cost(a) - cost(b) || deadline(a) - deadline(b);
    return matchCount(b, f.felder) - matchCount(a, f.felder) || deadline(a) - deadline(b);
  });
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
