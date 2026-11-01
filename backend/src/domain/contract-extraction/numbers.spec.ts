import {
  correctDigits,
  formatEuros,
  formatPercent,
  numberTokens,
  parseAmount,
  parseInteger,
  parsePercent,
} from './numbers';

describe('parseAmount', () => {
  it.each([
    ['150 000,00', 15000000],
    ['150.000', 15000000],
    ['150.000,00', 15000000],
    ['150000', 15000000],
    ['150 000', 15000000],
    ["150'000", 15000000],
    ['1 234 567,89', 123456789],
    ['850,5', 85050],
    ['850,50', 85050],
    ['0,99', 99],
    ['1,500.00', 150000],
    ['1.500,00', 150000],
    ['35', 3500],
    ['3.45', 345],
    ['00850,00', 85000],
  ])('lit « %s » comme %d centimes', (raw, cents) => {
    expect(parseAmount(raw)?.cents).toBe(cents);
  });

  it('reste exact là où un flottant dériverait', () => {
    expect(parseAmount('0,29')?.cents).toBe(29);
    expect(parseAmount('1 000 000,07')?.cents).toBe(100000007);
    expect(parseAmount('4 503 599 627 370,49')?.cents).toBe(450359962737049);
  });

  it('retire les groupes de fin quand le jeton est trop long', () => {
    const parsed = parseAmount('850,00 240');
    expect(parsed?.cents).toBe(85000);
    expect(parsed?.consumed).toBe('850,00'.length);
  });

  it('refuse les formats incohérents et les nombres démesurés', () => {
    expect(parseAmount('12 34')).toBeNull();
    expect(parseAmount('1,23,45')).toBeNull();
    expect(parseAmount('12345678901234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('signale décimales et séparateur de milliers', () => {
    expect(parseAmount('150 000,00')).toMatchObject({
      hasDecimals: true,
      grouped: true,
    });
    expect(parseAmount('850')).toMatchObject({
      hasDecimals: false,
      grouped: false,
    });
  });

  it('corrige les confusions OCR dans un jeton numérique et le signale', () => {
    expect(parseAmount('l50 000,OO')).toMatchObject({
      cents: 15000000,
      corrected: true,
    });
    expect(parseAmount('1S0 OOO')).toMatchObject({
      cents: 15000000,
      corrected: true,
    });
    expect(parseAmount('B50,00')).toMatchObject({
      cents: 85000,
      corrected: true,
    });
    expect(parseAmount('150 000,00')?.corrected).toBe(false);
  });
});

describe('parsePercent', () => {
  it.each([
    ['3,45', 345],
    ['3.45', 345],
    ['0', 0],
    ['0,00', 0],
    ['12', 1200],
    ['3,5', 350],
    ['3,450', 345],
    ['100', 10000],
  ])('lit « %s » comme %d centièmes', (raw, hundredths) => {
    expect(parsePercent(raw)).toMatchObject({ hundredths });
  });

  it('refuse plus de 2 décimales significatives', () => {
    expect(parsePercent('3,456')).toBe('TOO_PRECISE');
    expect(parsePercent('0,0001')).toBe('TOO_PRECISE');
  });

  it('refuse ce qui n’est pas un taux', () => {
    expect(parsePercent('3,4,5')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
  });

  it('corrige O → 0 dans un jeton numérique', () => {
    expect(parsePercent('3,4S')).toMatchObject({
      hundredths: 345,
      corrected: true,
    });
    expect(parsePercent('O,9O')).toMatchObject({ hundredths: 90 });
  });
});

describe('correctDigits', () => {
  it('refuse un mot (aucun vrai chiffre)', () => {
    expect(correctDigits('Sol')).toBeNull();
    expect(correctDigits('OIl')).toBeNull();
    expect(correctDigits('SB')).toBeNull();
  });

  it('applique O→0, l/I/|→1, S→5, B→8', () => {
    expect(correctDigits('1O5l')?.digits).toBe('1051');
    expect(correctDigits('2I|8')?.digits).toBe('2118');
    expect(correctDigits('S0B4')?.digits).toBe('5084');
  });
});

describe('numberTokens', () => {
  it('découpe les jetons et ignore les mots', () => {
    const tokens = numberTokens(
      "Selon l'article 12, le prêt de 150 000,00 € sur 240 mois",
    );
    expect(tokens.map((t) => t.raw)).toEqual(['12', '150 000,00', '240']);
  });

  it('ne prend pas un chiffre collé à une lettre', () => {
    expect(numberTokens('3M 12ème 4x').map((t) => t.raw)).toEqual([]);
  });

  it('ne reprend pas la ponctuation de fin de phrase', () => {
    expect(numberTokens('un taux de 3,45.').map((t) => t.raw)).toEqual([
      '3,45',
    ]);
  });
});

describe('parseInteger / formats', () => {
  it('lit un entier et refuse le reste', () => {
    expect(parseInteger('240')).toMatchObject({ value: 240, corrected: false });
    expect(parseInteger('24O')).toMatchObject({ value: 240, corrected: true });
    expect(parseInteger('2,4')).toBeNull();
  });

  it('formate montants et pourcentages pour les avertissements', () => {
    expect(formatEuros(15000000)).toBe('150 000,00 €');
    expect(formatEuros(5)).toBe('0,05 €');
    expect(formatPercent(345)).toBe('3,45 %');
    expect(formatPercent(5)).toBe('0,05 %');
  });
});
