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
  tips: string[];
  /** card accent from the brand palette */
  accent: 'oxblood' | 'ocean' | 'ink';
}

export const MENTORS: Mentor[] = [
  {
    field: 'Finance',
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
    field: 'Deep Tech',
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
  {
    field: 'Fashion',
    name: 'Xiao Lan',
    role: 'Studied fashion design, now working in luxury retail',
    accent: 'ink',
    tips: [
      "Don't be afraid to change direction.",
      'An unexpected job can teach you confidence and people skills.',
      "You don't need to have everything figured out.",
    ],
  },
];
