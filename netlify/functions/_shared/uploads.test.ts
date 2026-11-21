import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expired, pdfPages, sniffType, type FileMeta } from './uploads';

const pdf = (pages: number) => {
  const objs = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n');
  return new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count ${pages} >> endobj\n${objs}\n%%EOF`);
};

describe('uploads', () => {
  it('recognises the real type from the first bytes', () => {
    expect(sniffType(pdf(1))).toBe('application/pdf');
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffType(new Uint8Array(readFileSync('vorlagen/Lebenslauf-Vorlage-1-Schueler.docx')))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('rejects other files, also a PowerPoint (zip without word/) and renamed text', () => {
    expect(sniffType(new Uint8Array(readFileSync('vorlagen/Portfolio-Vorlage-4-Kreativ-Medien-Design.pptx')))).toBeNull();
    expect(sniffType(new TextEncoder().encode('MZ this is not a pdf'))).toBeNull();
  });

  it('counts PDF pages without counting the page tree', () => {
    expect(pdfPages(pdf(1))).toBe(1);
    expect(pdfPages(pdf(5))).toBe(5);
    expect(pdfPages(pdf(6))).toBe(6);
  });

  it('expires files after 30 days', () => {
    const meta = (days: number) => ({ zeit: new Date(Date.now() - days * 86400000).toISOString() }) as FileMeta;
    expect(expired(meta(29))).toBe(false);
    expect(expired(meta(31))).toBe(true);
  });
});
