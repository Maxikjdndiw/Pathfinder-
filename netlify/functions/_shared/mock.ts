/** Canned coach answers for local tests (PATHFINDER_MOCK=1): no API calls, no cost. */
import type { Mode } from './prompt';

export function mockReply(mode: Mode, messages: { role: string; content: string; dateien?: { name: string }[] }[]): string[] {
  const last = messages[messages.length - 1].content;
  const files = messages[messages.length - 1].dateien ?? [];
  const turn = messages.filter((m) => m.role === 'user').length;
  let text: string;
  if (last.includes('[[SYSTEM: MENTOR_ANFRAGE]]')) {
    text = '[[ZUSAMMENFASSUNG: Schüler aus Klasse 10, interessiert an Wirtschaft und Mode. Hat ein erstes Lebenslauf-Gerüst. Offene Frage: Wie findet man ein Praktikum im Modebereich in Schleswig-Holstein?]]';
  } else if (mode === 'cv_linkedin') {
    text = 'Testmodus: Lass uns mit deinem Lebenslauf anfangen. In welche Richtung soll er gehen, eher Wirtschaft oder eher Mode?\n[[BUTTONS: praktika:Weiter mit Praktika und Sommerkursen]]';
  } else if (/nochmal/i.test(last) && /shanghai/i.test(last)) {
    text = 'Testmodus: Hier sind die beiden Hochschulen in Shanghai noch einmal.\n[[EMPFEHLUNGEN: felder=wirtschaft | stufe=abschluss | typen=hochschule | land=ausland | ids=nyu-shanghai,fudan-uipe]]\n[[KARTE: nyu-shanghai,fudan-uipe]]';
  } else if (/mode/i.test(last) && mode === 'studium') {
    text = 'Testmodus: Mode also. Hier ist eine Hochschule für Mode.\n[[EMPFEHLUNGEN: felder=mode,design | stufe=abschluss | typen=hochschule | land=ausland | ids=marangoni-milano]]\n[[KARTE: marangoni-milano]]';
  } else if (/20\.?000/.test(last)) {
    text = 'Testmodus: Mit 20.000 Euro pro Jahr bleiben diese Wege.\n[[EMPFEHLUNGEN: felder=wirtschaft | stufe=abschluss | typen=hochschule | kosten=20000 | ids=bocconi-bsc,maastricht-bachelor]]\n[[KARTE: bocconi-bsc,maastricht-bachelor]]';
  } else if (/eher business/i.test(last)) {
    text = 'Testmodus: Dann schauen wir auf Business.\n[[EMPFEHLUNGEN: felder=intl-business | stufe=abschluss | typen=hochschule | ids=wu-wien-bachelor,ie-university-bba]]\n[[KARTE: wu-wien-bachelor,ie-university-bba]]';
  } else if (mode === 'studium') {
    text = turn === 1
      ? 'Testmodus: Lass uns Hochschulen finden. Was interessiert dich, und wo möchtest du studieren?'
      : 'Testmodus: Hier sind Hochschulen für Wirtschaft in Deutschland und im Ausland. Die Karte zeigt, wo sie liegen.\n[[EMPFEHLUNGEN: felder=wirtschaft | stufe=abschluss | typen=hochschule | sprache=en]]\n[[KARTE: bocconi-bsc,uni-mannheim-bwl,whu-bachelor,maastricht-bachelor,ie-university-bba]]';
  } else if (mode === 'praktika') {
    text = 'Testmodus: Praktika findest du über deine Schule, über Kammern und indem du Firmen direkt anschreibst. Wann hättest du Zeit, in den Ferien oder an Brückentagen?\n[[BUTTONS: studium:Weiter mit Studium]]';
  } else if (turn === 1) {
    text = 'Testmodus: Hi! Wir schauen zusammen, welche Wege zu dir passen könnten. In welche Klasse gehst du gerade?';
  } else if (turn === 2) {
    text = 'Danke! Hier ein paar Richtungen, die passen könnten. Informatik, weil du gern tüftelst, und Diplomatie als Überraschung, weil du gern verhandelst.\n[[OPTIONEN: Wirtschaft | Informatik | Diplomatie | Mode | Medizin | Keins davon, neue Vorschläge]]\n[[PROFIL: {"klasse":"10","felder":["wirtschaft"]}]]';
  } else if (turn === 3) {
    text = 'Gute Wahl. Unten siehst du Angebote aus unserer geprüften Liste: Kurse, Wettbewerbe und Sommerkurse. Mit den Filtern grenzt du nach Land, Kosten und Typ ein.\n[[EMPFEHLUNGEN: felder=informatik,wirtschaft | stufe=jung]]';
  } else {
    text = 'Wenn du magst, machen wir als Nächstes mit deinem Lebenslauf weiter.\n[[PROFIL: {"klasse":"10","felder":["informatik","wirtschaft"],"naechster_schritt":"Lebenslauf"}]]\n[[BUTTONS: cv_linkedin:Weiter mit Lebenslauf und LinkedIn | praktika:Überspringen: Praktika und Sommerkurse]]';
  }
  if (files.length) text = `Testmodus: Ich habe ${files.map((f) => f.name).join(', ')} bekommen. ${text}`;
  return text.match(/.{1,12}/gs) ?? [text];
}
