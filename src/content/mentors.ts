/**
 * Mentor tip cards in "Insider-Tipps". Add a card by adding an entry.
 * Photo: put a square image in /public/images and set  photo: 'images/<file>'.
 * Full tips unlock after signup, so cards only show short bullets (one line each).
 */
export interface Mentor {
  name: string;
  role: string;
  tips: string[];
  /** card accent from the brand palette */
  accent: 'oxblood' | 'ocean' | 'ink';
  photo?: string;
}

export const MENTORS: Mentor[] = [
  {
    name: 'Simone Simoncelli',
    role: 'Associate bei BlackRock',
    accent: 'oxblood',
    tips: [
      'In Networking investieren',
      'Diszipliniert und konstant lernen',
      'Der Uni-Name definiert nicht deine Ziele',
      'Dranbleiben und flexibel sein',
      'Nie aufhören zu lernen',
    ],
  },
  {
    name: 'Axel Thierauf',
    role: 'Venture Capital Deep Tech Investor, QAI Ventures',
    accent: 'ocean',
    tips: [
      'Gute Grundlagen schaffen (Mathe, Informatik, Physik)',
      'Selbst etwas ausprobieren',
      'Neugierig bleiben und Fragen stellen',
      'Deep Tech braucht verschiedene Talente',
    ],
  },
];
