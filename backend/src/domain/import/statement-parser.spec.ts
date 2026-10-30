import {
  parseAmountCents,
  parseDate,
  parseStatement,
} from './statement-parser';

describe('parseAmountCents', () => {
  it.each([
    ['-1 100,00', -110000],
    ['1.100,00', 110000],
    ['1,100.00', 110000],
    ['-1100.00', -110000],
    ['−12,50', -1250],
    ['(12,50)', -1250],
    ['12,50-', -1250],
    ['+3 800,00 €', 380000],
    ['0,29', 29],
    ['1,15', 115],
    ['-19,99', -1999],
    ['12', 1200],
    ['12,5', 1250],
    ['1.234', 123400],
  ])('reads %s as %d cents', (input, expected) => {
    expect(parseAmountCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '12/10/2026', '1,234,567.891', '--5', '€'])(
    'rejects %p',
    (input) => {
      expect(parseAmountCents(input)).toBeNull();
    },
  );
});

describe('parseDate', () => {
  it.each([
    ['02/10/2026', '2026-10-02'],
    ['2-10-2026', '2026-10-02'],
    ['02.10.26', '2026-10-02'],
    ['2026-10-02', '2026-10-02'],
    ['2026-10-02T08:30:00Z', '2026-10-02'],
  ])('reads %s', (input, iso) => {
    expect(parseDate(input)?.toISOString().slice(0, 10)).toBe(iso);
  });

  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('12/13/2026')).toBeNull();
    expect(parseDate('hier')).toBeNull();
  });
});

describe('parseStatement', () => {
  it('reads a header with date, label and signed amount', () => {
    const { rows, skipped } = parseStatement(
      [
        'Date;Libellé;Montant',
        '02/10/2026;PRLV LOYER;-1 100,00',
        '01/10/2026;VIR SALAIRE;3 800,00',
      ].join('\n'),
    );
    expect(
      rows.map((r) => [
        r.label,
        r.amountCents,
        r.date.toISOString().slice(0, 10),
      ]),
    ).toEqual([
      ['PRLV LOYER', -110000, '2026-10-02'],
      ['VIR SALAIRE', 380000, '2026-10-01'],
    ]);
    expect(skipped).toEqual([{ line: 1, reason: 'en-tete' }]);
  });

  it('reads separate debit and credit columns', () => {
    const { rows } = parseStatement(
      [
        'Date;Libellé;Débit;Crédit',
        '01/10/2026;VIR SALAIRE;;2 500,00',
        '02/10/2026;PRLV LOYER;900,00;',
        '03/10/2026;CB X;-45,10;',
      ].join('\r\n'),
    );
    expect(rows.map((r) => r.amountCents)).toEqual([250000, -90000, -4510]);
  });

  it('guesses the columns without a header, in any order', () => {
    const { rows } = parseStatement(
      '1 105,40;CB CARREFOUR MARKET;03/10/2026\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: 'CB CARREFOUR MARKET',
      amountCents: 110540,
    });
  });

  it('reads tab separated files and a leading BOM', () => {
    const { rows } = parseStatement('﻿03/10/2026\tPRLV EDF\t-96,00');
    expect(rows).toEqual([
      {
        line: 1,
        date: new Date('2026-10-03T00:00:00Z'),
        label: 'PRLV EDF',
        amountCents: -9600,
      },
    ]);
  });

  it('reports unreadable lines instead of guessing', () => {
    const { rows, skipped } = parseStatement(
      [
        'Solde au 30/09/2026 : 1 234,00',
        '04/10/2026;;-5,00',
        '05/10/2026;CB TEST;0,00',
        '31/02/2026;CB TEST;-5,00',
        '06/10/2026;CB OK;-5,00',
      ].join('\n'),
    );
    expect(rows.map((r) => r.label)).toEqual(['CB OK']);
    expect(skipped.map((s) => s.line)).toEqual([1, 2, 3, 4]);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringContaining('format'),
      'libelle absent',
      'montant nul',
      'date illisible',
    ]);
  });

  it('cleans and truncates labels to 80 characters', () => {
    const { rows } = parseStatement(`02/10/2026;  ${'A  B '.repeat(40)};-1,00`);
    expect(rows[0].label.length).toBeLessThanOrEqual(80);
    expect(rows[0].label).not.toContain('  ');
  });

  it('flags a statement longer than 2000 lines as truncated', () => {
    const lines = Array.from(
      { length: 2100 },
      (_, i) => `02/10/2026;CB N${i};-1,00`,
    );
    const result = parseStatement(lines.join('\n'));
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(2000);
  });
});
