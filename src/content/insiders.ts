/**
 * Insider cards ("Tipps von Studierenden an Top Unis").
 * Card 01 is real (FEATURED_INSIDER, shown first). Cards 02 to 06 are PLACEHOLDERS:
 * replace with real people, texts and photos.
 * Photo: put it in /public/images and add  photo: 'images/name.jpg'.
 */
export interface Insider {
  field: string;
  title: string;
  text: string;
  name: string;
  job: string;
  education: string;
  accent: 'oxblood' | 'ocean' | 'ink';
  photo?: string;
}

/** A real insider: monogram instead of a photo, a highlight quote and numbered tips. */
export interface FeaturedInsider {
  field: string;
  initials: string;
  name: string;
  job: string;
  path: string;
  quote: string;
  tips: { title: string; text: string }[];
}

/** Text exactly as approved; do not shorten. Disclaimer: impressum.html, "Insider-Tipps". */
export const FEATURED_INSIDER: FeaturedInsider = {
  field: 'Finance',
  initials: 'SS',
  name: 'Simone Simoncelli, CFA',
  job: 'Associate bei BlackRock',
  path: 'Weg: Universität Brescia, CFA, BlackRock',
  quote: 'Die Bücher sind für alle die gleichen.',
  tips: [
    {
      title: 'Disziplin schlägt Motivation',
      text: 'Motivation kommt und geht. Was zählt, ist Beständigkeit: Bau dir Gewohnheiten und einen festen Lernplan und halte dich daran.',
    },
    {
      title: 'Vernetz dich früh',
      text: 'Sprich mit Leuten, die schon in deinem Wunschbereich arbeiten, und geh zu Branchenevents. So entdeckst du Perspektiven und Chancen, auf die du allein nie gekommen wärst.',
    },
    {
      title: 'Dein Uni-Name ist nicht deine Grenze',
      text: 'Von einer weniger bekannten Uni ist es schwerer, zu Interviews eingeladen zu werden. Aber die Bücher sind für alle die gleichen. Wenn du eine Chance bekommst, zeig mit deiner Vorbereitung und der Qualität deiner Arbeit, was du kannst.',
    },
    {
      title: 'Bleib dran und bleib flexibel',
      text: 'Gib nicht auf, auch nicht nach hundert Absagen. Behalte dein Ziel im Blick, aber sei offen für den Weg dorthin. Manchmal ist ein kleinerer Schritt genau der, der dich näher ans Ziel bringt.',
    },
    {
      title: 'Hör nie auf zu lernen',
      text: 'Märkte und die Fähigkeiten, die sie verlangen, ändern sich ständig. Bleib auf dem neuesten Stand. Je mehr du lernst, desto mehr merkst du, wie viel es noch zu lernen gibt.',
    },
  ],
};

/** Placeholder cards 02 to 06. */
export const INSIDERS: Insider[] = [
  {
    field: 'Wirtschaft',
    title: 'So habe ich mein erstes Praktikum gefunden',
    text: 'Ohne Kontakte, mit einer guten E-Mail und viel Geduld.',
    name: 'Name folgt',
    job: 'Praktikum, Unternehmensberatung',
    education: 'BSc International Economics, Bocconi Mailand',
    accent: 'ocean',
  },
  {
    field: 'Design',
    title: 'Ein Portfolio, das auffällt',
    text: 'Warum fünf starke Arbeiten mehr zählen als zwanzig mittelmäßige.',
    name: 'Name folgt',
    job: 'Werkstudent, Produktdesign',
    education: 'Kommunikationsdesign, Kunsthochschule',
    accent: 'ink',
  },
  {
    field: 'Marketing',
    title: 'Was ich nach dem Abi anders machen würde',
    text: 'Ein Gap Year, drei Praktika und am Ende eine klare Richtung.',
    name: 'Name folgt',
    job: 'Junior Marketing Managerin',
    education: 'Bachelor in Business, IE Madrid',
    accent: 'oxblood',
  },
  {
    field: 'Tech',
    title: 'Programmieren lernen, schon in der Schule',
    text: 'Mit kleinen Projekten anfangen und sie öffentlich zeigen.',
    name: 'Name folgt',
    job: 'Software-Entwickler, Startup',
    education: 'Duales Studium Informatik',
    accent: 'ocean',
  },
  {
    field: 'Jura',
    title: 'Jura ist mehr als Gericht',
    text: 'Kanzlei, Unternehmen, Politik: wo Juristinnen und Juristen heute arbeiten.',
    name: 'Name folgt',
    job: 'Rechtsreferendarin',
    education: 'Rechtswissenschaft, Staatsexamen',
    accent: 'ink',
  },
];
