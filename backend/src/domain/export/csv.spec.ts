import { CSV_BOM, buildTransactionsCsv, csvAmount, csvText } from './csv';

describe('csvAmount', () => {
  it('formats cents with a decimal comma and no thousands separator', () => {
    expect(csvAmount(0)).toBe('0,00');
    expect(csvAmount(5)).toBe('0,05');
    expect(csvAmount(14230)).toBe('142,30');
    expect(csvAmount(110000)).toBe('1100,00');
    expect(csvAmount(123456789)).toBe('1234567,89');
    expect(csvAmount(-250)).toBe('-2,50');
  });
});

describe('csvText (formula injection and quoting)', () => {
  it('leaves harmless text alone', () => {
    expect(csvText('Courses')).toBe('Courses');
    expect(csvText('Café Étoilé 12/10')).toBe('Café Étoilé 12/10');
    expect(csvText('a-b = c')).toBe('a-b = c'); // le déclencheur doit être en tête
    expect(csvText('')).toBe('');
  });

  it.each([
    ['=SOMME(A1:A9)', "'=SOMME(A1:A9)"],
    ['+33612345678', "'+33612345678"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
  ])('prefixes %s with an apostrophe', (input, expected) => {
    expect(csvText(input)).toBe(expected);
  });

  it('also protects a leading tab or carriage return, and triggers hidden behind spaces', () => {
    expect(csvText('\t=1+1')).toBe(`"'\t=1+1"`);
    expect(csvText('\r=1+1')).toBe(`"'\r=1+1"`);
    expect(csvText('  =1+1')).toBe("'  =1+1");
    expect(csvText(' @x')).toBe("' @x");
    // Un espace seul devant un texte inoffensif : pas de préfixe, mais des guillemets.
    expect(csvText(' ok')).toBe('" ok"');
  });

  it('quotes fields with the separator, quotes or line breaks, doubling the quotes', () => {
    expect(csvText('a;b')).toBe('"a;b"');
    expect(csvText('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(csvText('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvText('ligne1\r\nligne2')).toBe('"ligne1\r\nligne2"');
    expect(csvText('"')).toBe('""""');
    expect(csvText('=a;"b"')).toBe(`"'=a;""b"""`);
    // Une apostrophe isolée n'impose pas de guillemets.
    expect(csvText("l'été")).toBe("l'été");
  });
});

describe('buildTransactionsCsv', () => {
  it('starts with a BOM and the header, uses ; and CRLF', () => {
    const csv = buildTransactionsCsv([]);
    expect(csv).toBe(`${CSV_BOM}Date;Type;Bloc;Libellé;Montant;Compte\r\n`);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes one line per operation with positive amounts', () => {
    const csv = buildTransactionsCsv([
      {
        date: '2026-10-03',
        kind: 'EXPENSE',
        bloc: 'COURANT',
        label: 'Courses',
        amountCents: 14230,
        accountName: 'Compte commun',
      },
      {
        date: '2026-10-28',
        kind: 'INCOME',
        bloc: null,
        label: 'Salaire',
        amountCents: 380000,
        accountName: '',
      },
      {
        date: '2026-10-29',
        kind: 'EXPENSE',
        bloc: 'EPARGNE',
        label: 'Virement livret',
        amountCents: 30000,
        accountName: 'Livret A',
      },
    ]);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Date;Type;Bloc;Libellé;Montant;Compte',
      '2026-10-03;Dépense;Courant;Courses;142,30;Compte commun',
      '2026-10-28;Revenu;;Salaire;3800,00;',
      '2026-10-29;Dépense;Épargne;Virement livret;300,00;Livret A',
      '',
    ]);
  });

  it('escapes label and account name, and keeps the columns aligned', () => {
    const csv = buildTransactionsCsv([
      {
        date: '2026-10-03',
        kind: 'EXPENSE',
        bloc: 'PLAISIR',
        label: '=1+1; "piège"',
        amountCents: 100,
        accountName: '@Compte',
      },
      {
        date: '2026-10-04',
        kind: 'EXPENSE',
        bloc: 'FIXE',
        label: 'multi\nligne',
        amountCents: 5,
        accountName: '',
      },
    ]);
    expect(csv).toContain(
      `2026-10-03;Dépense;Plaisir;"'=1+1; ""piège""";1,00;'@Compte\r\n`,
    );
    expect(csv).toContain('2026-10-04;Dépense;Fixe;"multi\nligne";0,05;\r\n');
  });
});
