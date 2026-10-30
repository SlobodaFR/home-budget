export const MAX_STATEMENT_BYTES = 1_000_000;

export type StatementEncoding = 'utf-8' | 'windows-1252';

export interface DecodedStatement {
  text: string;
  encoding: StatementEncoding;
}

export function decodeStatement(bytes: ArrayBuffer | Uint8Array): DecodedStatement {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

export function statementSizeError(byteLength: number): string | null {
  return byteLength > MAX_STATEMENT_BYTES
    ? 'Le relevé dépasse 1 Mo : exportez une période plus courte (un mois suffit).'
    : null;
}

export function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
