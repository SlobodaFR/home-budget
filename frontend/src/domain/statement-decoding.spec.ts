import { describe, expect, it } from 'vitest';
import { decodeStatement, MAX_STATEMENT_BYTES, statementSizeError, textByteLength } from './statement-decoding';

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

describe('decodeStatement', () => {
  it('reads valid UTF-8 with accents', () => {
    const bytes = new Uint8Array([...ascii('Caf'), 0xc3, 0xa9, ...ascii(';PR'), 0xc3, 0x89, ...ascii('L'), 0xc3, 0x88, ...ascii('VEMENT')]);
    expect(decodeStatement(bytes)).toEqual({ text: 'Café;PRÉLÈVEMENT', encoding: 'utf-8' });
  });

  it('falls back to windows-1252 for a real bank export', () => {
    const bytes = new Uint8Array([
      ...ascii('Date;Libell'),
      0xe9,
      ...ascii(';Montant\n02/10/2026;PR'),
      0xc9,
      ...ascii('L'),
      0xc8,
      ...ascii('VEMENT CAF'),
      0xc9,
      ...ascii(';-12,50 '),
      0x80,
    ]);
    const decoded = decodeStatement(bytes);
    expect(decoded.encoding).toBe('windows-1252');
    expect(decoded.text).toBe('Date;Libellé;Montant\n02/10/2026;PRÉLÈVEMENT CAFÉ;-12,50 €');
  });

  it('accepts an ArrayBuffer like File.arrayBuffer() returns', () => {
    const buffer = new Uint8Array([...ascii('Ren'), 0xe9]).buffer;
    expect(decodeStatement(buffer)).toEqual({ text: 'René', encoding: 'windows-1252' });
  });

  it('drops a UTF-8 byte order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...ascii('date;libelle')]);
    expect(decodeStatement(bytes).text).toBe('date;libelle');
  });

  it('reads plain ASCII as UTF-8', () => {
    expect(decodeStatement(new Uint8Array(ascii('a;b;1,00'))).encoding).toBe('utf-8');
  });
});

describe('statement size', () => {
  it('accepts up to 1 Mo and rejects beyond', () => {
    expect(statementSizeError(MAX_STATEMENT_BYTES)).toBeNull();
    expect(statementSizeError(MAX_STATEMENT_BYTES + 1)).toMatch(/1 Mo/);
  });

  it('counts bytes, not characters', () => {
    expect(textByteLength('é€')).toBe(5);
  });
});
