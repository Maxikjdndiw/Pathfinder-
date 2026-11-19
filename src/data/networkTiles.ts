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
  { id: 'finance', group: 'field', title: 'Finance & Wirtschaft', description: 'Studium, Praktika und Einstieg in Finance und Wirtschaft.', image: 'images/network/finance.webp', alt: 'Börsenkurve mit Kerzen auf einem dunklen Bildschirm', href: SIGNUP_ANCHOR },
  { id: 'design', group: 'field', title: 'Design', description: 'Portfolio, Aufnahmeprüfung und Hochschulen im Überblick.', image: 'images/network/design.webp', alt: 'Hand mit Stift zeichnet Skizzen auf einem Tablet', href: SIGNUP_ANCHOR },
  { id: 'marketing', group: 'field', title: 'Marketing', description: 'Vom Studiengang bis zum ersten Praktikum: gemeinsam herausfinden, was passt.', image: 'images/network/field-marketing.webp', alt: 'Pinnwand mit Skizzen, Ausschnitten und Notizen', href: SIGNUP_ANCHOR },
  { id: 'mode', group: 'field', title: 'Mode', description: 'Wege in die Modebranche, die nicht in jeder Broschüre stehen.', image: 'images/network/mode.webp', alt: 'Modeatelier mit Schneiderpuppen, Nähmaschinen und Entwürfen an der Wand', href: SIGNUP_ANCHOR },
  { id: 'tech', group: 'field', title: 'Tech', description: 'Informatik, KI und Gründen: wer macht was, und wie kommt man hin?', image: 'images/network/tech.webp', alt: 'Programmcode auf einem Bildschirm', href: SIGNUP_ANCHOR },
  { id: 'recht', group: 'field', title: 'Recht & Politik', description: 'Jura, Politik und internationale Beziehungen als Studien- und Berufsweg.', image: 'images/network/field-recht.webp', alt: 'Fassade eines klassischen Gerichtsgebäudes mit drei Bögen', href: SIGNUP_ANCHOR },
  // Cities
  { id: 'mailand', group: 'city', title: 'Mailand', description: 'Studieren in Italien: Bewerbung, Kosten und Alltag.', image: 'images/network/city-mailand.webp', alt: 'Blick vom Dach des Mailänder Doms über den Domplatz', href: SIGNUP_ANCHOR },
  { id: 'madrid', group: 'city', title: 'Madrid', description: 'Studieren in Spanien: Bewerbung, Kosten und Alltag.', image: 'images/network/city-madrid.webp', alt: 'Blick über die Dächer von Madrid und die Gran Vía bei Sonnenuntergang', href: SIGNUP_ANCHOR },
  { id: 'london', group: 'city', title: 'London', description: 'Studieren in Großbritannien: Bewerbung, Kosten und Alltag.', image: 'images/network/city-london.webp', alt: 'Skyline von London mit der Themse', href: SIGNUP_ANCHOR },
  { id: 'amsterdam', group: 'city', title: 'Amsterdam', description: 'Studieren in den Niederlanden: Bewerbung, Kosten und Alltag.', image: 'images/network/city-amsterdam.webp', alt: 'Giebelhäuser an einer Gracht in Amsterdam', href: SIGNUP_ANCHOR },
  // Activities
  { id: 'buddies', group: 'activity', title: 'Bewerbungs-Buddies', description: 'Geplant: Leute finden, die gleichzeitig bewerben, und sich gegenseitig motivieren.', image: 'images/network/activity-buddies.webp', alt: 'Zwei aufgeklappte Laptops nebeneinander auf einem Tisch', href: SIGNUP_ANCHOR },
  { id: 'mock-interview', group: 'activity', title: 'Mock Interviews', description: 'Geplant: Bewerbungsgespräche gemeinsam üben.', image: 'images/network/activity-mock-interview.webp', alt: 'Zwei Sessel, die einander gegenüberstehen', href: SIGNUP_ANCHOR },
  { id: 'essay', group: 'activity', title: 'Essay-Feedback', description: 'Geplant: ein zweiter Blick auf dein Motivationsschreiben.', image: 'images/network/activity-essay.webp', alt: 'Aufgeschlagene Buchseite mit einem markierten Absatz', href: SIGNUP_ANCHOR },
  { id: 'stipendien', group: 'activity', title: 'Stipendien & Fristen', description: 'Wer kennt welche Stipendien, und wann läuft welche Frist ab?', image: 'images/network/activity-stipendien.webp', alt: 'Aufgeschlagener Monatskalender auf einem Tisch', href: SIGNUP_ANCHOR },
];
