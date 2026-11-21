import { afterEach, describe, expect, it } from 'vitest';
import { codesStore, isAllowed, newCode, type AccessRecord } from './codes';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('self-requested access codes', () => {
  it('creates codes in the form ABCD-1234 without I and O', () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[A-HJ-NP-Z]{4}-\d{4}$/);
  });

  it('accepts env codes and stored codes, in any case', async () => {
    process.env.PATHFINDER_ACCESS_CODES = 'ABCD-1234';
    const rec: AccessRecord = { code: 'WXYZ-0001', vorname: 'Test', email: 't@example.org', erstellt: new Date().toISOString(), zuletztBenutzt: null, gesperrt: false };
    await codesStore().set('code/WXYZ0001', rec);
    expect(await isAllowed('abcd-1234')).toBe(true);
    expect(await isAllowed('wxyz-0001')).toBe(true);
    expect(await isAllowed('WXYZ-0002')).toBe(false);
  });

  it('rejects a blocked code and remembers the last login', async () => {
    delete process.env.PATHFINDER_ACCESS_CODES;
    const s = codesStore();
    await s.set('code/QRST5678', { code: 'QRST-5678', vorname: 'A', email: 'a@example.org', erstellt: '', zuletztBenutzt: null, gesperrt: false });
    expect(await isAllowed('QRST-5678', true)).toBe(true);
    expect((await s.get<AccessRecord>('code/QRST5678'))?.zuletztBenutzt).toBeTruthy();
    await s.set('code/QRST5678', { ...(await s.get<AccessRecord>('code/QRST5678'))!, gesperrt: true });
    expect(await isAllowed('QRST-5678')).toBe(false);
  });
});
