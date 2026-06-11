import { describe, expect, it } from 'vitest';
import { formatCents, formatSignedCents } from './money';

describe('money formatting', () => {
  it('formats cents as euros with French locale', () => {
    expect(formatCents(425000).replace(/\s/g, ' ')).toContain('4 250,00');
  });

  it('prefixes credits with a plus sign', () => {
    expect(formatSignedCents(280000)).toMatch(/^\+ /);
  });

  it('prefixes debits with a minus sign', () => {
    expect(formatSignedCents(-8450)).toMatch(/^- /);
  });
});
