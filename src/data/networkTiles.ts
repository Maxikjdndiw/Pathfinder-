/**
 * Tiles of the "Netzwerk" sphere (and of its fallback grid).
 * This is the only file to change when real images replace the placeholders:
 * put the new file in public/images/network/ and change `image` (and `alt`) here.
 * Photo tiles are made by `npm run network-images` from the path-card originals.
 */
export type NetworkGroup = 'field' | 'city' | 'activity';

export interface NetworkTile {
  id: string;
  group: NetworkGroup;
  title: string;
  description: string;
  /** path inside public/, without leading slash */
  image: string;
  /** German alt text */
  alt: string;
  /** every tile leads to the sign-up in the Netzwerk section */
  href: string;
}

const SIGNUP_ANCHOR = '#netzwerk-anmelden';

export const NETWORK_GROUP_LABELS: Record<NetworkGroup, string> = {
  field: 'Bereich',
  city: 'Stadt',
  activity: 'Gemeinsam',
};

export const NETWORK_TILES: NetworkTile[] = [
  // Fields
  { id: 'finance', group: 'field', title: 'Finance & Wirtschaft', description: 'Fragen zu Bocconi, IE und Co. an Leute, die denselben Weg gehen.', image: 'images/network/finance.webp', alt: 'Börsenkurve mit Kerzen auf einem dunklen Bildschirm', href: SIGNUP_ANCHOR },
  { id: 'design', group: 'field', title: 'Design', description: 'Portfolio, Aufnahmeprüfung, Hochschulen: tausch dich mit Gleichgesinnten aus.', image: 'images/network/design.webp', alt: 'Hand mit Stift zeichnet Skizzen auf einem Tablet', href: SIGNUP_ANCHOR },
  { id: 'marketing', group: 'field', title: 'Marketing', description: 'Vom Studiengang bis zum ersten Praktikum: gemeinsam herausfinden, was passt.', image: 'images/network/field-marketing.svg', alt: 'Abstrakte Grafik: Kreise, die sich von einem Punkt ausbreiten', href: SIGNUP_ANCHOR },
  { id: 'mode', group: 'field', title: 'Mode', description: 'Wege in die Modebranche, die nicht in jeder Broschüre stehen.', image: 'images/network/mode.webp', alt: 'Modeatelier mit Schneiderpuppen, Nähmaschinen und Entwürfen an der Wand', href: SIGNUP_ANCHOR },
  { id: 'tech', group: 'field', title: 'Tech', description: 'Informatik, KI und Gründen: wer macht was, und wie kommt man hin?', image: 'images/network/tech.webp', alt: 'Programmcode auf einem Bildschirm', href: SIGNUP_ANCHOR },
  { id: 'recht', group: 'field', title: 'Recht & Politik', description: 'Jura, Politik und internationale Beziehungen aus erster Hand.', image: 'images/network/field-recht.svg', alt: 'Abstrakte Grafik: eine Waage aus einfachen Formen', href: SIGNUP_ANCHOR },
  // Cities
  { id: 'mailand', group: 'city', title: 'Mailand', description: 'Erfahrungen mit Unis in Mailand, von Bewerbung bis Alltag.', image: 'images/network/bocconi.webp', alt: 'Blick vom Dach des Mailänder Doms über den Domplatz', href: SIGNUP_ANCHOR },
  { id: 'madrid', group: 'city', title: 'Madrid', description: 'Wie ist das Studium in Madrid wirklich? Frag die, die dort sind.', image: 'images/network/city-madrid.svg', alt: 'Abstrakte Grafik: Sonne über Häuserblöcken', href: SIGNUP_ANCHOR },
  { id: 'london', group: 'city', title: 'London', description: 'Bewerbung, Kosten und Leben in London, ehrlich erzählt.', image: 'images/network/kings-college.webp', alt: 'Skyline von London mit der Themse', href: SIGNUP_ANCHOR },
  { id: 'amsterdam', group: 'city', title: 'Amsterdam', description: 'Studieren in den Niederlanden: Tipps von denen, die es machen.', image: 'images/network/city-amsterdam.svg', alt: 'Abstrakte Grafik: schmale Giebelhäuser an einem Kanal', href: SIGNUP_ANCHOR },
  // Activities
  { id: 'buddies', group: 'activity', title: 'Bewerbungs-Buddies', description: 'Finde jemanden, der gleichzeitig bewirbt, und motiviert euch gegenseitig.', image: 'images/network/activity-buddies.svg', alt: 'Abstrakte Grafik: zwei Kreise, die sich überschneiden', href: SIGNUP_ANCHOR },
  { id: 'mock-interview', group: 'activity', title: 'Mock Interviews', description: 'Übe Gespräche mit Leuten, die sie schon hinter sich haben.', image: 'images/network/activity-mock-interview.svg', alt: 'Abstrakte Grafik: zwei Sprechblasen', href: SIGNUP_ANCHOR },
  { id: 'essay', group: 'activity', title: 'Essay-Feedback', description: 'Ein zweiter Blick auf dein Motivationsschreiben.', image: 'images/network/activity-essay.svg', alt: 'Abstrakte Grafik: ein Blatt mit einer markierten Zeile', href: SIGNUP_ANCHOR },
  { id: 'stipendien', group: 'activity', title: 'Stipendien & Fristen', description: 'Wer kennt welche Stipendien, und wann läuft welche Frist ab?', image: 'images/network/activity-stipendien.svg', alt: 'Abstrakte Grafik: ein Kalender mit einem markierten Tag', href: SIGNUP_ANCHOR },
];
