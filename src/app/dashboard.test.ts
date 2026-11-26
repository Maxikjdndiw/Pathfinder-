import { describe, expect, it } from 'vitest';
import { daysLeft, greetingLine, myDeadlines, timeSlot } from './dashboard';

describe('dashboard', () => {
  it('picks the time slot', () => {
    expect([6, 12, 15, 19, 23, 3].map(timeSlot)).toEqual(['morgen', 'mittag', 'nachmittag', 'abend', 'nacht', 'nacht']);
  });
  it('greets with and without a name', () => {
    expect(greetingLine('Maxi', 8, () => 0)).toBe('Guten Morgen, Maxi.');
    expect(greetingLine('', 8, () => 0)).toBe('Guten Morgen.');
    expect(greetingLine('', 15, () => 0)).toBe('Produktiver Nachmittag?');
    for (let i = 0; i < 25; i++) expect(greetingLine('', i % 24, () => (i % 5) / 5)).not.toMatch(/\{name\}|\s[.?!]|,\s*[.?!]/);
  });
  it('counts days left', () => {
    const today = new Date(2026, 10, 26, 18, 0);
    expect(daysLeft('2026-11-26', today)).toBe(0);
    expect(daysLeft('2026-11-30', today)).toBe(4);
    expect(daysLeft('2026-11-20', today)).toBe(-6);
  });
  it('lists only saved offers, dated ones first and sorted', () => {
    const list = myDeadlines(['informatik-biber', 'bundeswettbewerb-mathematik', 'jugend-forscht-2027', 'gibt-es-nicht'], new Date(2026, 10, 26));
    expect(list.map((x) => x.offer.id)).toEqual(['jugend-forscht-2027', 'bundeswettbewerb-mathematik', 'informatik-biber']);
    expect(list[2].days).toBeNull();
  });
});
