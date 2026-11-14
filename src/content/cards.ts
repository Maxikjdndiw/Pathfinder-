/**
 * The flying cards. Each card is one possible path.
 *
 * To use a real photo instead of the generated colour fill:
 *   1. put the image in /public/images (for example /public/images/bocconi.jpg)
 *   2. add  image: 'images/bocconi.jpg'  to that card below.
 * Portrait images around 3:4 (e.g. 900 x 1200 px) look best.
 */
export type CardVariant = 'oxblood' | 'ocean' | 'ink' | 'card';

export interface PathCard {
  title: string;
  detail: string;
  kind: string; // small label on top of the card
  variant: CardVariant;
  image?: string;
}

export const CARDS: PathCard[] = [
  { title: 'Finance', detail: 'Banken, Börse, Investments', kind: 'Bereich', variant: 'oxblood' },
  { title: 'Bocconi', detail: 'Studium in Mailand', kind: 'Uni', variant: 'card' },
  { title: 'Design', detail: 'Produkt, Grafik, Interface', kind: 'Bereich', variant: 'ocean' },
  { title: 'Unternehmens­beratung', detail: 'Probleme lösen für Firmen', kind: 'Beruf', variant: 'ink' },
  { title: 'Stipendium', detail: 'Studium ohne Studiengebühren-Sorgen', kind: 'Förderung', variant: 'oxblood' },
  { title: "King's College", detail: 'Studium in London', kind: 'Uni', variant: 'card' },
  { title: 'Marketing', detail: 'Marken, Kampagnen, Social', kind: 'Bereich', variant: 'ink' },
  { title: 'Praktikum', detail: 'Praktikum ab Klasse 10', kind: 'Erfahrung', variant: 'ocean' },
  { title: 'Private Equity', detail: 'In Firmen investieren', kind: 'Beruf', variant: 'oxblood' },
  { title: 'Mode', detail: 'Design, Einkauf, Management', kind: 'Bereich', variant: 'card' },
  { title: 'IE Madrid', detail: 'Business-Studium in Spanien', kind: 'Uni', variant: 'ink' },
  { title: 'Tech', detail: 'Software, Daten, KI', kind: 'Bereich', variant: 'ocean' },
  { title: 'Medizin', detail: 'Mehr als nur Ärztin oder Arzt', kind: 'Bereich', variant: 'card' },
  { title: 'Startup', detail: 'Selbst etwas gründen', kind: 'Weg', variant: 'oxblood' },
  { title: 'Jura', detail: 'Kanzlei, Firma, Staat', kind: 'Bereich', variant: 'ink' },
  { title: 'Architektur', detail: 'Räume und Städte planen', kind: 'Bereich', variant: 'card' },
  { title: 'Auslandsjahr', detail: 'Schule oder Studium im Ausland', kind: 'Erfahrung', variant: 'ocean' },
  { title: 'Wirtschaft', detail: 'BWL, VWL, Management', kind: 'Bereich', variant: 'oxblood' },
  { title: 'Sommerschule', detail: 'Uni-Kurse schon als Schüler', kind: 'Erfahrung', variant: 'card' },
  { title: 'Investment Banking', detail: 'Große Deals begleiten', kind: 'Beruf', variant: 'ink' },
  { title: 'Duales Studium', detail: 'Lernen und Geld verdienen', kind: 'Weg', variant: 'ocean' },
  { title: 'Werkstudent', detail: 'Arbeiten neben dem Studium', kind: 'Erfahrung', variant: 'card' },
  { title: 'Journalismus', detail: 'Recherchieren und erzählen', kind: 'Bereich', variant: 'oxblood' },
  { title: 'Data Science', detail: 'Mit Daten Fragen beantworten', kind: 'Beruf', variant: 'ink' },
  { title: 'ETH Zürich', detail: 'Studium in der Schweiz', kind: 'Uni', variant: 'card' },
  { title: 'Sciences Po', detail: 'Studium in Paris', kind: 'Uni', variant: 'ocean' },
  { title: 'Wirtschafts\u00ADprüfung', detail: 'Zahlen von Firmen prüfen', kind: 'Beruf', variant: 'oxblood' },
  { title: 'Psychologie', detail: 'Verstehen, wie Menschen denken', kind: 'Bereich', variant: 'ink' },
  { title: 'Ingenieur\u00ADwesen', detail: 'Maschinen, Energie, Mobilität', kind: 'Bereich', variant: 'card' },
  { title: 'Gap Year', detail: 'Ein Jahr für dich nach dem Abi', kind: 'Weg', variant: 'oxblood' },
  { title: 'Film und Medien', detail: 'Produktion, Regie, Content', kind: 'Bereich', variant: 'ocean' },
  { title: 'Nachhaltigkeit', detail: 'Klima, Energie, ESG', kind: 'Bereich', variant: 'ink' },
  { title: 'Politik', detail: 'Ministerien, Parteien, NGOs', kind: 'Bereich', variant: 'card' },
  { title: 'Schülerakademie', detail: 'Zwei Wochen mit Gleichgesinnten', kind: 'Förderung', variant: 'oxblood' },
];
