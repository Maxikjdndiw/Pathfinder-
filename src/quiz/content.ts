/**
 * Pathfinder Run: ALL content in one place.
 * Questions, challenge texts, scoring, fields, archetypes, sentence templates, image paths
 * and UI copy. Logic lives in engine.ts, the interface in ui.ts.
 *
 * Inhalte vor Launch prüfen.
 *
 * Scoring model: every scored moment is a ScoreGroup. A group has outcomes; the FIRST
 * outcome whose conditions all hold is applied (an outcome with no conditions is the
 * default). Groups add up. The maximum possible value per trait is computed from these
 * groups automatically (engine.maxPossibleAbs), so you can change numbers freely here.
 * Conditions read "metrics" that the interface records, e.g. 'c1.time' (seconds).
 */

/* ------------------------------------------------------------------ */
/* Traits                                                              */
/* ------------------------------------------------------------------ */

export type Trait = 'analytic' | 'build' | 'stage' | 'risk' | 'people' | 'order';
/** Vector order everywhere: [analytic, build, stage, risk, people, order] */
export const TRAITS: Trait[] = ['analytic', 'build', 'stage', 'risk', 'people', 'order'];

export const TRAIT_POLES: Record<Trait, { plus: string; minus: string }> = {
  analytic: { plus: 'Zahlen', minus: 'Gefühl' },
  build: { plus: 'Bauen', minus: 'Verstehen' },
  stage: { plus: 'Bühne', minus: 'Maschinenraum' },
  risk: { plus: 'Risiko', minus: 'Sicherheit' },
  people: { plus: 'Menschen', minus: 'Fokus' },
  order: { plus: 'Ordnung', minus: 'Offenheit' },
};

/** Radar chart axis labels, in TRAITS order */
export const RADAR_LABELS = ['Zahlen', 'Bauen', 'Bühne', 'Risiko', 'Menschen', 'Ordnung'];

/* ------------------------------------------------------------------ */
/* Scoring types                                                       */
/* ------------------------------------------------------------------ */

export type Effects = Partial<Record<Trait, number>>;
export type MetricValue = number | string | boolean | undefined;
export type Metrics = Record<string, MetricValue>;

export interface Cond {
  /** metric key, e.g. 'c1.time' */
  m: string;
  eq?: string | number | boolean;
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
}

export interface Outcome {
  id: string;
  /** all must hold; empty = always */
  when: Cond[];
  effects: Effects;
}

export interface ScoreGroup {
  id: string;
  /** which step it belongs to (c1..c4, dilemmas) */
  source: 'c1' | 'c2' | 'c3' | 'c4' | 'dilemmas';
  outcomes: Outcome[];
}

const funGroup = (source: 'c1' | 'c2' | 'c3' | 'c4', ja: Effects, nein: Effects): ScoreGroup => ({
  id: `${source}.fun`,
  source,
  outcomes: [
    { id: 'ja', when: [{ m: `${source}.fun`, eq: 'ja' }], effects: ja },
    { id: 'nein', when: [{ m: `${source}.fun`, eq: 'nein' }], effects: nein },
  ],
});

/* ------------------------------------------------------------------ */
/* Setup (not scored)                                                  */
/* ------------------------------------------------------------------ */

export const SETUP = {
  grade: {
    question: 'In welcher Klasse bist du?',
    options: ['9', '10', '11', '12', '13'],
  },
  abroad: {
    question: 'Kannst du dir vorstellen, im Ausland zu studieren?',
    options: [
      { id: 'yes', label: 'Ja, unbedingt' },
      { id: 'maybe', label: 'Vielleicht' },
      { id: 'de', label: 'Lieber in Deutschland' },
    ],
  },
  note: 'Damit dein Ergebnis zu dir passt.',
};

/* ------------------------------------------------------------------ */
/* Challenges                                                          */
/* ------------------------------------------------------------------ */

export const FUN_QUESTION = 'Hat dir das Spaß gemacht?';

export const C1 = {
  id: 'c1',
  title: 'Die Schätzung',
  text: 'Wie viele Döner werden an einem Tag in Deutschland gegessen?',
  min: 1_000,
  max: 100_000_000,
  confidenceLabel: 'Wie sicher bist du?',
  hintButton: 'Wie würde man das rechnen?',
  hint: 'Tipp: Wie viele Menschen leben in Deutschland? Wie viele davon essen pro Woche einen Döner?',
  after: 'Eine exakte Zahl gibt es nicht. Uns interessiert, wie du schätzt.',
};

export type PosterFlaw = 'misaligned' | 'typo' | 'color';
export interface PosterRound {
  flaw: PosterFlaw;
  kicker: string;
  headline: string;
  /** headline on the poster with the flaw (only differs for the typo round) */
  flawHeadline?: string;
  body: string;
  button: string;
}

export const C2 = {
  id: 'c2',
  title: 'Was stimmt hier nicht?',
  text: 'Ein Poster hat einen Fehler. Tipp drauf.',
  seconds: 10,
  rounds: [
    { flaw: 'misaligned', kicker: 'Sommerakademie', headline: 'Zwei Wochen, die alles ändern', body: 'Kurse, Projekte und Leute, die so denken wie du.', button: 'Jetzt bewerben' },
    { flaw: 'typo', kicker: 'Neu', headline: 'Stipendium für dich', flawHeadline: 'Stipendum für dich', body: 'Bewirb dich bis Ende des Monats.', button: 'Mehr erfahren' },
    { flaw: 'color', kicker: 'Infoabend', headline: 'Dein Weg nach dem Abi', body: 'Donnerstag, 18 Uhr, in der Aula.', button: 'Platz sichern' },
  ] as PosterRound[],
  /** neon green for the flawed button in round 3 */
  clashColor: '#39FF14',
  correct: 'Richtig.',
  wrong: 'Knapp daneben.',
  timeout: 'Zeit um.',
};

export const C3 = {
  id: 'c3',
  title: 'Das Muster',
  text: 'Welche Zahl kommt als Nächstes?',
  sequences: [
    { shown: [2, 4, 8, 16], answer: 32 },
    { shown: [1, 1, 2, 3, 5, 8], answer: 13 },
    { shown: [3, 6, 11, 18, 27], answer: 38 },
  ],
  check: 'Prüfen',
  skip: 'Langweilig, weiter',
  correct: 'Stimmt.',
  wrong: (answer: number) => `Nicht ganz. Die Antwort war ${answer}.`,
};

export const C4 = {
  id: 'c4',
  title: 'Das Budget',
  text: 'Du hast 100.000 € für dein Startup. Verteil es.',
  total: 100_000,
  step: 5_000,
  categories: [
    { key: 'produkt', label: 'Produkt', color: 'var(--accent)' },
    { key: 'marketing', label: 'Marketing', color: 'var(--ink)' },
    { key: 'team', label: 'Team', color: 'var(--ink-muted)' },
    { key: 'design', label: 'Design', color: '#8DB8E8' }, // light tint of the accent
    { key: 'ruecklage', label: 'Rücklage', color: 'var(--line)' },
  ],
  left: 'Noch übrig',
};

export const CHALLENGE_TITLES: Record<'c1' | 'c2' | 'c3' | 'c4', string> = {
  c1: C1.title,
  c2: C2.title,
  c3: C3.title,
  c4: C4.title,
};

/* ------------------------------------------------------------------ */
/* Dilemmas                                                            */
/* ------------------------------------------------------------------ */

export interface Dilemma {
  id: string;
  prompt?: string;
  options: { id: 'a' | 'b' | 'c'; text: string; effects: Effects }[];
}

export const DILEMMA_INTRO = {
  heading: 'Jetzt schnell.',
  text: 'Jetzt schnell. 5 Sekunden pro Frage. Bauchgefühl.',
  noTimer: 'Ohne Timer spielen',
  seconds: 5,
  defaultPrompt: 'Was nimmst du?',
};

export const DILEMMAS: Dilemma[] = [
  {
    id: 'd1',
    options: [
      { id: 'a', text: 'Ein Projekt, das 1 Million Menschen nutzen, aber keiner kennt deinen Namen', effects: { stage: -1, build: 0.5 } },
      { id: 'b', text: 'Ein Projekt für 1.000 Menschen, und alle wissen, dass es von dir ist', effects: { stage: 1 } },
    ],
  },
  {
    id: 'd2',
    options: [
      { id: 'a', text: '50 % Chance auf 200.000 €', effects: { risk: 1 } },
      { id: 'b', text: 'Sicher 80.000 €', effects: { risk: -1 } },
    ],
  },
  {
    id: 'd3',
    prompt: 'Eine wichtige Entscheidung:',
    options: [
      { id: 'a', text: 'Ich mache eine Tabelle', effects: { analytic: 1, order: 0.3 } },
      { id: 'b', text: 'Ich höre auf mein Bauchgefühl', effects: { analytic: -1, risk: 0.3 } },
    ],
  },
  {
    id: 'd4',
    prompt: 'Montag:',
    options: [
      { id: 'a', text: 'Leerer Kalender, du entscheidest alles', effects: { order: -1, risk: 0.5 } },
      { id: 'b', text: 'Klarer Plan, du weißt genau, was zu tun ist', effects: { order: 1 } },
    ],
  },
  {
    id: 'd5',
    options: [
      { id: 'a', text: 'Etwas Perfektes in einem Jahr', effects: { order: 1, risk: -0.5 } },
      { id: 'b', text: 'Etwas Gutes in einer Woche', effects: { build: 1, risk: 0.5, order: -0.5 } },
    ],
  },
  {
    id: 'd6',
    prompt: '5 Minuten vor dem Meeting findest du einen Fehler in der Präsentation deines Chefs.',
    options: [
      { id: 'a', text: 'Ich sag es sofort', effects: { people: 0.5, order: 0.5, stage: 0.5 } },
      { id: 'b', text: 'Ich sag nichts', effects: { people: -0.5, risk: -0.5 } },
      { id: 'c', text: 'Kommt drauf an, wie schlimm', effects: { analytic: 0.5 } },
    ],
  },
  {
    id: 'd7',
    options: [
      { id: 'a', text: 'Den ganzen Tag allein an einem schweren Problem', effects: { people: -1, analytic: 0.5 } },
      { id: 'b', text: 'Den ganzen Tag Gespräche mit 10 verschiedenen Leuten', effects: { people: 1 } },
    ],
  },
  {
    id: 'd8',
    options: [
      { id: 'a', text: 'Verstehen, WARUM etwas funktioniert', effects: { build: -1, analytic: 0.5 } },
      { id: 'b', text: 'Es einfach zum Laufen bringen', effects: { build: 1 } },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Scoring groups                                                      */
/* ------------------------------------------------------------------ */

const posterRound = (r: 1 | 2 | 3): ScoreGroup => ({
  id: `c2.r${r}`,
  source: 'c2',
  outcomes: [
    {
      id: 'correct-fast',
      when: [{ m: `c2.r${r}.result`, eq: 'correct' }, { m: `c2.r${r}.time`, lt: 4 }],
      effects: { order: 0.5, build: 0.8, analytic: -0.3 },
    },
    { id: 'correct', when: [{ m: `c2.r${r}.result`, eq: 'correct' }], effects: { order: 0.5, build: 0.5, analytic: -0.3 } },
    { id: 'wrong-fast', when: [{ m: `c2.r${r}.result`, eq: 'wrong' }, { m: `c2.r${r}.time`, lt: 2 }], effects: { risk: 0.5 } },
  ],
});

const sequence = (s: 1 | 2 | 3): ScoreGroup => ({
  id: `c3.s${s}`,
  source: 'c3',
  outcomes: [{ id: 'correct', when: [{ m: `c3.s${s}`, eq: 'correct' }], effects: { analytic: 0.7 } }],
});

const share = (key: string, rule: Omit<Cond, 'm'>): Cond => ({ m: `c4.${key}`, ...rule });

export const SCORE_GROUPS: ScoreGroup[] = [
  // C1 Die Schätzung
  { id: 'c1.time', source: 'c1', outcomes: [{ id: 'fast', when: [{ m: 'c1.time', lt: 8 }], effects: { risk: 1 } }] },
  {
    id: 'c1.conf',
    source: 'c1',
    outcomes: [
      { id: 'sure', when: [{ m: 'c1.conf', gte: 70 }], effects: { risk: 1, stage: 0.5 } },
      { id: 'unsure', when: [{ m: 'c1.conf', lte: 30 }], effects: { risk: -1 } },
    ],
  },
  { id: 'c1.hint', source: 'c1', outcomes: [{ id: 'hint', when: [{ m: 'c1.hint', eq: true }], effects: { analytic: 1, build: -1 } }] },
  funGroup('c1', { analytic: 0.5, risk: 0.5 }, { analytic: -0.5 }),

  // C2 Was stimmt hier nicht?
  posterRound(1),
  posterRound(2),
  posterRound(3),
  funGroup('c2', { build: 0.5, analytic: -0.5 }, { build: -0.3 }),

  // C3 Das Muster
  sequence(1),
  sequence(2),
  sequence(3),
  { id: 'c3.skip', source: 'c3', outcomes: [{ id: 'skip', when: [{ m: 'c3.skip', eq: true }], effects: { order: -1, analytic: -0.5, stage: 0.3 } }] },
  funGroup('c3', { analytic: 0.5, build: -0.5, stage: -0.3 }, { analytic: -0.5 }),

  // C4 Das Budget (shares of the total, 0..1)
  {
    id: 'c4.reserve',
    source: 'c4',
    outcomes: [
      { id: 'high', when: [share('ruecklage', { gte: 0.25 })], effects: { risk: -1, order: 1 } },
      { id: 'low', when: [share('ruecklage', { lt: 0.1 })], effects: { risk: 1 } },
    ],
  },
  { id: 'c4.marketing', source: 'c4', outcomes: [{ id: 'high', when: [share('marketing', { gte: 0.3 })], effects: { stage: 1, people: 0.5 } }] },
  { id: 'c4.produkt', source: 'c4', outcomes: [{ id: 'high', when: [share('produkt', { gte: 0.35 })], effects: { build: 1, stage: -0.5 } }] },
  { id: 'c4.team', source: 'c4', outcomes: [{ id: 'high', when: [share('team', { gte: 0.3 })], effects: { people: 1 } }] },
  { id: 'c4.design', source: 'c4', outcomes: [{ id: 'high', when: [share('design', { gte: 0.25 })], effects: { build: 0.5, analytic: -0.5 } }] },
  // all five between 15 % and 25 % (derived metric, see engine.deriveMetrics)
  { id: 'c4.balanced', source: 'c4', outcomes: [{ id: 'balanced', when: [{ m: 'c4.balanced', eq: true }], effects: { order: 1, risk: -0.5 } }] },
  funGroup('c4', { risk: 0.5, people: 0.3, stage: 0.3 }, { risk: -0.3 }),

  // Dilemmas: chosen option id in metric 'd1'..'d8'; timeout = no points
  ...DILEMMAS.map<ScoreGroup>((d) => ({
    id: d.id,
    source: 'dilemmas',
    outcomes: d.options.map((o) => ({ id: o.id, when: [{ m: d.id, eq: o.id }], effects: o.effects })),
  })),
];

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

export interface Field {
  id: string;
  name: string;
  kind: 'main' | 'wildcard';
  /** [analytic, build, stage, risk, people, order] */
  vector: number[];
  jobs: string[];
  study: string[];
  unisDe: string[];
  unisAbroad: string[];
  scholarships: string[];
  stepEarly: string; // Klasse 9 bis 10
  stepLate: string; // Klasse 11 bis 13
}

const field = (
  id: string,
  name: string,
  kind: Field['kind'],
  vector: number[],
  row: string,
): Field => {
  const [jobs, study, unisDe, unisAbroad, scholarships, stepEarly, stepLate] = row.split(' | ');
  const list = (s: string) => s.split(', ').map((x) => x.trim());
  return { id, name, kind, vector, jobs: list(jobs), study: list(study), unisDe: list(unisDe), unisAbroad: list(unisAbroad), scholarships: list(scholarships), stepEarly, stepLate };
};

// Inhalte vor Launch prüfen. Format: Jobs | Studium | Unis DE | Unis Ausland | Stipendium | Schritt Klasse 9 bis 10 | Schritt Klasse 11 bis 13
export const FIELDS: Field[] = [
  field('finance', 'Finance & Investment', 'main', [0.8, -0.1, 0.1, 0.6, 0.2, 0.5],
    'Investment Banker, Analyst im Asset Management, Private Equity | BWL, Finance, VWL | Universität Mannheim, Frankfurt School of Finance & Management | Bocconi (Mailand), LSE (London) | Studienstiftung, Deutschlandstipendium | Mach beim Planspiel Börse mit | Mach eine kostenlose virtuelle Job Simulation im Bereich Investment Banking'),
  field('consulting', 'Consulting & Strategie', 'main', [0.6, -0.3, 0.4, 0.1, 0.8, 0.4],
    'Unternehmensberater, Strategy Analyst, Inhouse Consultant | BWL, Wirtschaftsingenieurwesen, VWL | WHU Otto Beisheim School of Management, LMU München | Universität St. Gallen (HSG), IE University (Madrid) | Deutschlandstipendium, e-fellows.net | Lös eine Case Study auf YouTube mit, z. B. "Wie viele Tennisbälle passen in einen Bus?" | Mach eine kostenlose virtuelle Job Simulation im Bereich Beratung'),
  field('marketing', 'Marketing & Medien', 'main', [-0.3, 0.3, 0.9, 0.3, 0.6, -0.4],
    'Brand Manager, Social Media Strategist, Content Producer | Medienmanagement, BWL mit Marketing, Kommunikation | Universität zu Köln, Hochschule Macromedia | IE University (Madrid), Copenhagen Business School | Deutschlandstipendium | Bau einen Instagram Account zu einem Thema auf und analysier, was funktioniert | Mach ein Praktikum in einer Agentur oder im Marketing einer Firma vor Ort'),
  field('design', 'Design & Architektur', 'main', [-0.5, 0.8, 0.2, 0.0, -0.1, 0.0],
    'UX Designer, Architekt, Grafikdesigner | Kommunikationsdesign, Architektur, Produktdesign | Universität der Künste Berlin, TU München (Architektur) | ETH Zürich, Politecnico di Milano | Studienstiftung | Gestalte jeden Tag ein Poster oder Logo und sammel sie in einem Portfolio | Bau ein Online Portfolio, die meisten Designstudiengänge wollen eine Mappe'),
  field('mode', 'Mode', 'main', [-0.8, 0.6, 0.6, 0.5, 0.3, -0.6],
    'Modedesigner, Buyer, Brand Manager Fashion | Modedesign, Fashion Management, Textiltechnik | AMD Akademie Mode & Design, HTW Berlin | Central Saint Martins (London), Politecnico di Milano | Deutschlandstipendium | Lern nähen oder zeichnen und dokumentier deine Entwürfe | Mach ein Praktikum bei einer Modemarke oder im Einzelhandel'),
  field('tech', 'Tech & Informatik', 'main', [0.6, 0.9, -0.6, 0.2, -0.6, 0.0],
    'Software Engineer, KI Entwickler, IT Security | Informatik, Wirtschaftsinformatik, Data Engineering | TU München, KIT Karlsruhe | ETH Zürich, Imperial College London | Studienstiftung, Deutschlandstipendium | Mach einen kostenlosen Online Kurs zum Programmieren | Bau ein eigenes kleines Projekt und stell es auf GitHub'),
  field('medizin', 'Medizin & Life Sciences', 'main', [0.4, -0.6, -0.2, -0.7, 0.7, 0.7],
    'Ärztin oder Arzt, Biotech Forscher, Pharma | Medizin, Biochemie, Molekulare Medizin | Charité Berlin, Universität Heidelberg | Karolinska Institutet (Stockholm), Medizinische Universität Wien | Studienstiftung | Mach einen Erste Hilfe Kurs oder geh in den Schulsanitätsdienst | Informier dich über den TMS (Test für medizinische Studiengänge) und mach ein Praktikum im Krankenhaus'),
  field('recht', 'Recht & Politik', 'main', [0.2, -0.7, 0.6, -0.2, 0.6, 0.6],
    'Anwalt, Richter, Politikberater | Jura, Politikwissenschaft, Internationale Beziehungen | Bucerius Law School (Hamburg), Universität Heidelberg | Sciences Po (Paris), King\'s College London | Studienstiftung, Deutschlandstipendium | Mach bei Jugend debattiert mit | Besuch eine öffentliche Gerichtsverhandlung oder mach bei Model United Nations mit'),

  field('logistik', 'Supply Chain & Logistik', 'wildcard', [0.7, 0.2, -0.6, -0.3, 0.2, 0.8],
    'Supply Chain Manager, Einkäufer, Logistikplaner | Logistik, Wirtschaftsingenieurwesen, BWL | Kühne Logistics University (Hamburg), TU Hamburg | Erasmus University Rotterdam, Bocconi (Mailand) | Deutschlandstipendium | Finde heraus, wie dein Handy von der Fabrik zu dir kam | Mach ein Praktikum im Hafen oder bei einer Spedition'),
  field('data', 'Data Science', 'wildcard', [0.9, 0.3, -0.5, 0.0, -0.5, 0.3],
    'Data Scientist, Data Analyst, Machine Learning Engineer | Data Science, Statistik, Informatik | LMU München, TU Dortmund | EPFL (Lausanne), University of Edinburgh | Studienstiftung | Lern die Grundlagen von Python mit einem kostenlosen Kurs | Analysier einen echten Datensatz, z. B. Sportstatistiken, und schreib darüber'),
  field('diplomatie', 'Diplomatie & Internationale Organisationen', 'wildcard', [0.0, -0.7, 0.5, -0.3, 0.9, 0.5],
    'Diplomat, Referent bei der EU oder UN, NGO Manager | Internationale Beziehungen, Politikwissenschaft, Jura | Universität Passau, Universität Konstanz | Sciences Po (Paris), King\'s College London | Studienstiftung, Erasmus+ für Auslandssemester | Mach bei Model United Nations mit | Bewirb dich für einen Schüleraustausch oder ein Auslandsjahr'),
  field('produkt', 'Produktmanagement', 'wildcard', [0.3, 0.6, 0.2, 0.3, 0.7, -0.2],
    'Product Manager, Product Owner, UX Researcher | Wirtschaftsinformatik, BWL, Informatik | CODE University Berlin, TU München | IE University (Madrid), Bocconi (Mailand) | Deutschlandstipendium | Schreib auf, was dich an deiner Lieblingsapp nervt und wie du es lösen würdest | Mach bei einem Hackathon mit'),
  field('energie', 'Nachhaltigkeit & Energie', 'wildcard', [0.4, 0.4, -0.2, -0.1, 0.2, 0.3],
    'Energy Analyst, Sustainability Manager, Ingenieur Erneuerbare Energien | Umweltwissenschaften, Energietechnik, Nachhaltigkeitsmanagement | Leuphana Universität Lüneburg, RWTH Aachen | Wageningen University, DTU (Kopenhagen) | Deutschlandstipendium | Mach bei Jugend forscht mit einem Umweltprojekt mit | Mach ein Praktikum bei einem Windpark oder Stadtwerk in deiner Region'),
  field('psychologie', 'Psychologie & People', 'wildcard', [-0.5, -0.6, -0.1, -0.4, 0.9, 0.0],
    'Psychologe, HR Business Partner, Coach | Psychologie, Wirtschaftspsychologie, Personalmanagement | Universität Hamburg, Universität Mannheim | Maastricht University, University of Amsterdam | Studienstiftung | Lies ein populäres Psychologiebuch und fass es zusammen | Mach ein Praktikum in einer Personalabteilung'),
  field('journalismus', 'Journalismus', 'wildcard', [-0.3, -0.6, 0.6, 0.4, 0.4, -0.6],
    'Journalist, Podcaster, Redakteur | Journalistik, Kommunikationswissenschaft, Politik | TU Dortmund (Journalistik), Deutsche Journalistenschule (München) | City St George\'s (London), University of Amsterdam | Deutschlandstipendium | Schreib für die Schülerzeitung oder starte einen Podcast | Mach ein Praktikum bei einer Lokalzeitung'),
  field('gruenden', 'Gründen & Startups', 'wildcard', [0.1, 0.8, 0.5, 0.9, 0.5, -0.8],
    'Gründer, Venture Capital Analyst, Startup Generalist | BWL, Entrepreneurship, Informatik | WHU Otto Beisheim School of Management, CODE University Berlin | IE University (Madrid), Bocconi (Mailand) | e-fellows.net | Verkauf etwas, egal was, und rechne aus, was übrig bleibt | Bau ein kleines Business und such dir einen Mentor'),
];

/* ------------------------------------------------------------------ */
/* Archetypes                                                          */
/* ------------------------------------------------------------------ */

export interface Archetype {
  id: string;
  name: string;
  /** [analytic, build, stage, risk, people, order] */
  vector: number[];
  line: string;
  /** card front photo (900 px wide, duotone). See public/quiz/archetypes/CREDITS.md */
  photo: string;
  /** what the photo should show */
  photoBrief: string;
}

const photo = (slug: string) => `/quiz/archetypes/${slug}.jpg`;

export const ARCHETYPES: Archetype[] = [
  { id: 'dealmaker', name: 'Dealmaker', vector: [0.6, 0, 0.4, 0.9, 0.3, 0], line: 'Du siehst Chancen, wo andere Risiken sehen. Und du rechnest nach, bevor du springst.', photo: photo('dealmaker'), photoBrief: 'City skyline at night seen from a high office window' },
  { id: 'mastermind', name: 'Mastermind', vector: [0.8, -0.3, 0, 0, 0.6, 0.4], line: 'Du denkst drei Schritte voraus und bringst andere dazu, mitzugehen.', photo: photo('mastermind'), photoBrief: 'Chess board close up, mid game' },
  { id: 'creator', name: 'Creator', vector: [-0.7, 0.7, 0.3, 0, 0, -0.6], line: 'Regeln sind für dich eher Vorschläge. Du machst Dinge, die es so noch nicht gab.', photo: photo('creator'), photoBrief: 'Messy art studio table with paint, sketches and brushes' },
  { id: 'builder', name: 'Builder', vector: [0.5, 0.9, -0.6, 0, -0.4, 0], line: 'Du redest nicht lange, du baust. Und am Ende funktioniert es.', photo: photo('builder'), photoBrief: 'Workbench with tools or a circuit board close up' },
  { id: 'storyteller', name: 'Storyteller', vector: [-0.5, 0, 0.9, 0, 0.4, -0.3], line: 'Du weißt, dass die beste Idee nichts bringt, wenn sie keiner fühlt.', photo: photo('storyteller'), photoBrief: 'Empty stage with one spotlight and a microphone' },
  { id: 'leader', name: 'Leader', vector: [0, 0, 0.7, 0.4, 0.8, 0], line: 'Wenn es eng wird, schauen alle zu dir. Und du hast kein Problem damit.', photo: photo('leader'), photoBrief: 'Rope team on a mountain ridge seen from far away' },
  { id: 'detective', name: 'Detective', vector: [0.7, -0.8, 0, 0, -0.4, 0.3], line: 'Dir reicht nicht, dass etwas funktioniert. Du willst wissen, warum.', photo: photo('detective'), photoBrief: 'Magnifying glass over an old map or blueprint' },
  { id: 'connector', name: 'Connector', vector: [-0.2, 0, -0.2, -0.5, 0.9, 0], line: 'Du verstehst Menschen schneller, als sie sich selbst verstehen.', photo: photo('connector'), photoBrief: 'Long table with many hands and plates, seen from above' },
];

/* ------------------------------------------------------------------ */
/* Personal sentences ("Warum?")                                       */
/* ------------------------------------------------------------------ */

export interface SentenceTemplate {
  id: string;
  priority: number;
  when: Cond[];
  text: string;
  /** placeholder → metric and format */
  vars?: Record<string, { m: string; fmt: 'int' | 'dec1' | 'pct' | 'text' }>;
}

export const SENTENCES: SentenceTemplate[] = [
  { id: 'c1-instinct', priority: 9, when: [{ m: 'c1.time', lt: 8 }, { m: 'c1.conf', gte: 70 }], text: 'Du hast in {sec} Sekunden geschätzt und warst dir zu {conf} % sicher. Das ist Trader Instinkt.', vars: { sec: { m: 'c1.time', fmt: 'int' }, conf: { m: 'c1.conf', fmt: 'int' } } },
  { id: 'c1-hint', priority: 8, when: [{ m: 'c1.hint', eq: true }], text: 'Bei der Schätzung wolltest du zuerst wissen, wie man rechnet. Du willst Systeme verstehen, nicht nur Antworten.' },
  { id: 'c2-all', priority: 8, when: [{ m: 'c2.correct', eq: 3 }], text: 'Du hast alle 3 Fehler gefunden. Dein Auge für Details ist selten.' },
  { id: 'c2-fast', priority: 7, when: [{ m: 'c2.correct', gte: 1 }, { m: 'c2.avgCorrectTime', lt: 4 }], text: 'Du hast die Fehler im Schnitt in {sec} Sekunden gesehen. Das ist Designer Blick.', vars: { sec: { m: 'c2.avgCorrectTime', fmt: 'dec1' } } },
  { id: 'c3-skip', priority: 8, when: [{ m: 'c3.skip', eq: true }], text: 'Das Muster hast du übersprungen. Wiederholung langweilt dich, gut zu wissen.' },
  { id: 'c3-all', priority: 7, when: [{ m: 'c3.correct', eq: 3 }], text: 'Alle 3 Zahlenreihen gelöst. Muster springen dich an.' },
  { id: 'c4-marketing', priority: 8, when: [{ m: 'c4.marketing', gte: 0.3 }], text: 'Du hast {pct} % ins Marketing gesteckt. Du weißt, dass das beste Produkt nichts bringt, wenn es keiner kennt.', vars: { pct: { m: 'c4.marketing', fmt: 'pct' } } },
  { id: 'c4-reserve-high', priority: 8, when: [{ m: 'c4.ruecklage', gte: 0.25 }], text: '{pct} % als Rücklage. Du baust Dinge, die auch einen schlechten Monat überleben.', vars: { pct: { m: 'c4.ruecklage', fmt: 'pct' } } },
  { id: 'c4-reserve-low', priority: 7, when: [{ m: 'c4.ruecklage', lt: 0.1 }], text: 'Fast keine Rücklage. Du setzt alles auf eine Karte und glaubst daran.' },
  { id: 'c4-product', priority: 7, when: [{ m: 'c4.produkt', gte: 0.35 }], text: '{pct} % ins Produkt. Für dich zählt zuerst, dass das Ding wirklich gut ist.', vars: { pct: { m: 'c4.produkt', fmt: 'pct' } } },
  { id: 'c4-team', priority: 6, when: [{ m: 'c4.team', gte: 0.3 }], text: 'Dein größter Posten war das Team. Du weißt, dass Menschen den Unterschied machen.' },
  { id: 'd2-d4-freedom', priority: 7, when: [{ m: 'd2', eq: 'a' }, { m: 'd4', eq: 'a' }], text: 'Lieber 50 % auf 200.000 € und lieber ein leerer Kalender. Du brauchst Freiheit, um gut zu sein.' },
  { id: 'd6-speak-up', priority: 6, when: [{ m: 'd6', eq: 'a' }], text: 'Du sagst deinem Chef 5 Minuten vor dem Meeting, dass er einen Fehler hat. Das trauen sich wenige.' },
  { id: 'd-hesitate', priority: 6, when: [{ m: 'd.timeouts', gte: 3 }], text: 'Bei schnellen Entscheidungen hast du öfter gezögert. Du denkst lieber nach, bevor du dich festlegst.' },
  { id: 'd-fast', priority: 5, when: [{ m: 'd.allAnswered', eq: true }, { m: 'd.avgTime', lt: 2 }], text: 'Du hast im Schnitt in {sec} Sekunden entschieden. Bauchgefühl ist eine deiner Stärken.', vars: { sec: { m: 'd.avgTime', fmt: 'dec1' } } },
  { id: 'fun-contrast', priority: 4, when: [{ m: 'fun.contrast', eq: true }], text: '{challenge} hat dir Spaß gemacht, {other} nicht. Das sagt mehr als jeder Fragebogen.', vars: { challenge: { m: 'fun.best', fmt: 'text' }, other: { m: 'fun.other', fmt: 'text' } } },
];

/** Priority 1 fallbacks, by the strongest traits */
export const TRAIT_SENTENCES: Record<Trait, { plus: string; minus: string }> = {
  analytic: { plus: 'Du entscheidest mit Zahlen, nicht mit Hoffnung.', minus: 'Du spürst, was richtig ist, bevor du es erklären kannst.' },
  build: { plus: 'Du willst Dinge machen, nicht nur darüber reden.', minus: 'Du gibst dich erst zufrieden, wenn du verstanden hast, wie etwas funktioniert.' },
  stage: { plus: 'Du hast kein Problem damit, gesehen zu werden.', minus: 'Du arbeitest am liebsten da, wo die eigentliche Arbeit passiert.' },
  risk: { plus: 'Ein bisschen Risiko macht dich wach, nicht nervös.', minus: 'Du baust lieber auf etwas Sicheres, als alles zu verlieren.' },
  people: { plus: 'Du bekommst Energie von anderen Menschen.', minus: 'Du bist am besten, wenn dich keiner stört.' },
  order: { plus: 'Ein klarer Plan gibt dir Freiheit im Kopf.', minus: 'Du brauchst Raum, um deinen eigenen Weg zu finden.' },
};

/* ------------------------------------------------------------------ */
/* UI copy                                                             */
/* ------------------------------------------------------------------ */

export const COPY = {
  start: {
    heading: 'Pathfinder Run',
    text: '4 Challenges. 8 Entscheidungen.',
    button: "Los geht's",
    last: (name: string) => `Dein letztes Ergebnis: ${name}`,
    view: 'Ansehen',
    restart: 'Neu starten',
  },
  next: 'Weiter',
  done: 'Fertig',
  yes: 'Ja',
  no: 'Nein',
  challenge: (n: number) => `Challenge ${n} von 4`,
  dilemma: (n: number) => `Entscheidung ${n} von 8`,
  result: {
    yourType: 'Dein Typ',
    brand: 'Pathfinder Run',
    cardLabel: (name: string) => `Ergebniskarte ${name}. Zum Umdrehen Enter drücken.`,
    mixHeading: 'Deine Mischung',
    pathsHeading: 'Deine Wege',
    wildcard: 'Wildcard',
    cta: 'Kostenlos mitmachen',
    share: 'Ergebnis teilen',
    shareTitle: 'Mein Pathfinder Run Ergebnis',
    radarHeading: 'Dein Profil',
    whyHeading: 'Warum?',
    detailsHeading: 'Deine Wege im Detail',
    jobs: 'Typische Jobs',
    study: 'Was du studieren kannst',
    unisDe: 'Beispiele für Studienorte in Deutschland',
    unisAbroad: 'Beispiele für Studienorte im Ausland',
    scholarship: 'Stipendium-Tipp',
    nextStep: 'Dein nächster Schritt diesen Monat',
    match: 'Passung',
    again: 'Nochmal spielen',
    footnote: 'Pathfinder Run ist ein Spiel, kein wissenschaftlicher Test. Nimm es als Startpunkt, nicht als Urteil.',
  },
};

/** localStorage key for the last result */
export const STORAGE_KEY = 'pathfinder-run-result';
