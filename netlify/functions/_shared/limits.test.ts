import { afterEach, describe, expect, it } from 'vitest';
import { accessCodes, isValidCode, normaliseCode } from './limits';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('access codes', () => {
  it('accepts the code in any case, with or without spaces', () => {
    process.env.PATHFINDER_ACCESS_CODES = 'ABCD-1234,WXYZ-0001';
    expect(isValidCode(normaliseCode('ABCD-1234'))).toBe(true);
    expect(isValidCode(normaliseCode('abcd-1234'))).toBe(true);
    expect(isValidCode(normaliseCode(' abcd-1234 '))).toBe(true);
    expect(isValidCode(normaliseCode('ABCD1234'))).toBe(true);
  });

  it('rejects wrong and empty codes', () => {
    process.env.PATHFINDER_ACCESS_CODES = 'ABCD-1234';
    expect(isValidCode(normaliseCode('ABCD-0000'))).toBe(false);
    expect(isValidCode(normaliseCode(''))).toBe(false);
    expect(isValidCode(normaliseCode(undefined))).toBe(false);
  });

  it('tolerates spaces and quotes in the env value', () => {
    process.env.PATHFINDER_ACCESS_CODES = '"ABCD-1234, wxyz-0001"';
    expect(accessCodes()).toEqual(['ABCD1234', 'WXYZ0001']);
  });

  it('falls back to ACCESS_CODES', () => {
    delete process.env.PATHFINDER_ACCESS_CODES;
    process.env.ACCESS_CODES = 'ABCD-1234';
    expect(isValidCode(normaliseCode('abcd-1234'))).toBe(true);
  });

  it('rejects everything when no codes are set', () => {
    delete process.env.PATHFINDER_ACCESS_CODES;
    delete process.env.ACCESS_CODES;
    expect(isValidCode(normaliseCode('ABCD-1234'))).toBe(false);
  });
});
