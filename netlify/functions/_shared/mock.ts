/** Canned coach answers for local tests (PATHFINDER_MOCK=1): no API calls, no cost. */
import type { Mode } from './prompt';

export function mockReply(mode: Mode, messages: { role: string; content: string }[]): string[] {
  const last = messages[messages.length - 1].content;
  const turn = messages.filter((m) => m.role === 'user').length;
  let text: string;
  if (last.includes('[[SYSTEM: MENTOR_ANFRAGE]]')) {
    text = '[[ZUSAMMENFASSUNG: Schüler aus Klasse 10, interessiert an Wirtschaft und Mode. Hat ein erstes Lebenslauf-Gerüst. Offene Frage: Wie findet man ein Praktikum im Modebereich in Schleswig-Holstein?]]';
  } else if (mode === 'cv_linkedin') {
    text = 'Testmodus: Lass uns mit deinem Lebenslauf anfangen. In welche Richtung soll er gehen, eher Wirtschaft oder eher Mode?\n[[BUTTONS: praktika:Weiter mit Praktika und Sommerkursen]]';
  } else if (mode === 'praktika') {
    text = 'Testmodus: Praktika findest du über deine Schule, über Kammern und indem du Firmen direkt anschreibst. Wann hättest du Zeit, in den Ferien oder an Brückentagen?';
  } else if (turn === 1) {
    text = 'Testmodus: Hi! Wir schauen zusammen, welche Wege zu dir passen könnten. In welche Klasse gehst du gerade?';
  } else if (turn === 2) {
    text = 'Danke! Hier ein paar Richtungen, die passen könnten. Informatik, weil du gern tüftelst, und Diplomatie als Überraschung, weil du gern verhandelst.\n[[OPTIONEN: Wirtschaft | Informatik | Diplomatie | Mode | Medizin | Keins davon, neue Vorschläge]]\n[[PROFIL: {"klasse":"10","felder":["wirtschaft"]}]]';
  } else if (turn === 3) {
    text = 'Gute Wahl. Unten siehst du Angebote aus unserer geprüften Liste: Kurse, Wettbewerbe und Sommerkurse. Mit den Filtern grenzt du nach Land, Kosten und Typ ein.\n[[EMPFEHLUNGEN: felder=informatik,wirtschaft | stufe=jung]]';
  } else {
    text = 'Wenn du magst, machen wir als Nächstes mit deinem Lebenslauf weiter.\n[[PROFIL: {"klasse":"10","felder":["informatik","wirtschaft"],"naechster_schritt":"Lebenslauf"}]]\n[[BUTTONS: cv_linkedin:Weiter mit Lebenslauf und LinkedIn | praktika:Überspringen: Praktika und Sommerkurse]]';
  }
  return text.match(/.{1,12}/gs) ?? [text];
}
