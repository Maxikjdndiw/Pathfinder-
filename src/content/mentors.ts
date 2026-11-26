/**
 * Real insider cards, shown first in the "Insider-Tipps" card stack (placeholders follow).
 * Add a card by adding an entry; it replaces one placeholder.
 * Full tips unlock after signup, so cards only show short bullets.
 */
export interface Mentor {
  /** chip at the top left */
  field: string;
  name: string;
  role: string;
  /** optional heading above the bullets */
  headline?: string;
  tips: string[];
}

export const MENTORS: Mentor[] = [
  {
    field: 'Finance',
    name: 'Simone Simoncelli',
    role: 'Associate bei BlackRock',
    tips: [
      'In Networking investieren',
      'Diszipliniert und konstant lernen',
      'Der Uni-Name definiert nicht deine Ziele',
      'Dranbleiben und flexibel sein',
      'Nie aufhören zu lernen',
    ],
  },
  {
    field: 'Deep Tech',
    name: 'Axel Thierauf',
    role: 'Venture Capital Deep Tech Investor, QAI Ventures',
    tips: [
      'Gute Grundlagen schaffen (Mathe, Informatik, Physik)',
      'Selbst etwas ausprobieren',
      'Neugierig bleiben und Fragen stellen',
      'Deep Tech braucht verschiedene Talente',
    ],
  },
  {
    field: 'Mode',
    name: 'Xiao Lan',
    role: 'Hat Modedesign studiert, arbeitet jetzt im Luxuseinzelhandel',
    tips: [
      'Hab keine Angst, die Richtung zu ändern.',
      'Ein unerwarteter Job kann dir Selbstvertrauen und den Umgang mit Menschen beibringen.',
      'Du musst noch nicht alles wissen.',
    ],
  },
  {
    field: 'Bewerbung',
    name: 'Harshita Anindya Werneke',
    role: 'Student Recruitment Manager an der EBS Universität',
    headline: 'Wir wollen den Menschen hinter der Bewerbung kennenlernen.',
    tips: [
      'Zeig mehr als Noten: Ehrenamt, Sport und Interessen zählen.',
      'Halte deinen Lebenslauf klar und aktuell.',
      'Bewirb dich früh, das nimmt Druck.',
      'Sprich vorher mit der Uni, du brauchst nicht alle Antworten.',
      'Sei ehrlich, wenn eine Uni nicht passt.',
    ],
  },
];
