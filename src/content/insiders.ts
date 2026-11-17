/**
 * Insider cards ("Tipps von Studierenden an Top Unis").
 * PLACEHOLDERS, shown after the real cards from mentors.ts (6 cards in total).
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

/** Placeholder cards; real cards come from src/content/mentors.ts and go first. */
export const INSIDERS: Insider[] = [
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
