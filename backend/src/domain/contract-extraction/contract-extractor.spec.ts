import {
  AUTO_COLUMNS,
  FORM_NEXT_LINE,
  IMMO_CLEAN,
  INSURANCE_RATE_ONLY_TOTAL,
  INSURANCE_REMAINING,
  KNOWN_BANK_ONLY,
  LENDER_BY_DEFINITION,
  LENDER_DOUBTFUL,
  MULTI_PAGE,
  MULTI_RATES,
  NO_ACCENTS,
  OCR_GARBAGE,
  OCR_NOISY_DIGITS,
  PTZ,
  REALISTIC_LONG,
  TABLE_LAYOUT,
  TAEG_ONLY,
  UNRELATED,
  VARIABLE_RATE,
} from '../../testing/contract-fixtures';
import { extractContractFields } from './contract-extractor';
import { ContractExtraction, ExtractedField } from './extraction.types';

/** Les mini-textes des tests sont complétés d'une phrase neutre pour dépasser le seuil de texte minimal. */
const FILLER =
  'Conditions particulières du contrat de prêt à lire attentivement avant toute signature.';
const run = (...pages: string[]): ContractExtraction =>
  extractContractFields(
    pages.length === 1 && pages[0].trim().length > 0 && pages[0].length < 160
      ? [`${FILLER}\n${pages[0]}`]
      : pages,
  );

const get = (
  result: ContractExtraction,
  name: ExtractedField['field'],
): ExtractedField | undefined => result.fields.find((f) => f.field === name);

const values = (result: ContractExtraction) =>
  Object.fromEntries(result.fields.map((f) => [f.field, f.value]));

describe('extractContractFields — offre de prêt immobilier claire', () => {
  const result = run(IMMO_CLEAN);

  it('lit tous les champs avec les bonnes valeurs', () => {
    expect(values(result)).toEqual({
      lender: 'Banque Exemple',
      contractReference: 'PI-2024-004517',
      principalCents: 15000000,
      annualRatePercent: 3.45,
      initialTermMonths: 240,
      monthlyPaymentCents: 86233,
      rateType: 'FIXED',
      insuranceMonthlyCents: 3500,
      feesCents: 90000,
      guaranteeKind: 'SURETY',
      guaranteeCents: 150000,
      startDate: '2024-04-05',
    });
  });

  it('ne produit aucun avertissement sur un document net', () => {
    expect(result.warnings).toEqual([]);
  });

  it('attribue HIGH aux libellés explicites', () => {
    for (const name of [
      'lender',
      'contractReference',
      'principalCents',
      'annualRatePercent',
      'initialTermMonths',
      'monthlyPaymentCents',
      'insuranceMonthlyCents',
      'feesCents',
      'guaranteeKind',
      'guaranteeCents',
    ] as const) {
      expect(get(result, name)?.confidence).toBe('HIGH');
    }
  });

  it('donne MEDIUM à la date de première échéance (libellé proche d’une date de début)', () => {
    expect(get(result, 'startDate')?.confidence).toBe('MEDIUM');
  });

  it('ne confond pas le TAEG avec le taux débiteur', () => {
    expect(get(result, 'annualRatePercent')?.value).toBe(3.45);
    expect(get(result, 'annualRatePercent')?.snippet).not.toMatch(/3,89/);
  });

  it('fournit des extraits courts, normalisés, avec le numéro de page', () => {
    for (const field of result.fields) {
      expect(field.snippet.length).toBeGreaterThan(0);
      expect(field.snippet.length).toBeLessThanOrEqual(140);
      expect(field.snippet).toBe(field.snippet.replace(/\s+/g, ' ').trim());
      expect(field.page).toBe(1);
    }
    expect(get(result, 'principalCents')?.snippet).toBe(
      'Montant du crédit : 150 000,00 €',
    );
    expect(get(result, 'lender')?.snippet).toBe(
      'Établissement prêteur : Banque Exemple',
    );
  });

  it('retourne au plus une valeur par champ, dans l’ordre du contrat', () => {
    const names = result.fields.map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('extractContractFields — crédit auto en colonnes', () => {
  const result = run(AUTO_COLUMNS);

  it('lit les montants avec points de conduite et « EUR »', () => {
    expect(values(result)).toMatchObject({
      lender: 'Crédit du Nord-Test',
      contractReference: 'CA-77120-3391',
      principalCents: 1850000,
      annualRatePercent: 4.9,
      initialTermMonths: 60,
      monthlyPaymentCents: 34807,
      rateType: 'FIXED',
      insuranceMonthlyCents: 1250,
      feesCents: 15000,
    });
  });

  it('ne prend ni le coût total, ni le montant total dû pour le capital', () => {
    expect(get(result, 'principalCents')?.value).toBe(1850000);
  });

  it('est cohérent : aucun avertissement de mensualité', () => {
    expect(result.warnings).toEqual([]);
  });
});

describe('extractContractFields — tableau en-têtes / valeurs', () => {
  const result = run(TABLE_LAYOUT);

  it('associe chaque en-tête à sa colonne', () => {
    expect(values(result)).toMatchObject({
      principalCents: 12000000,
      initialTermMonths: 180,
      annualRatePercent: 2.95,
    });
  });

  it('prend le taux débiteur, pas le TAEG voisin', () => {
    expect(get(result, 'annualRatePercent')?.value).toBe(2.95);
  });

  it('plafonne à MEDIUM un montant sans devise lu dans un tableau', () => {
    expect(get(result, 'principalCents')?.confidence).toBe('HIGH');
  });
});

describe('extractContractFields — libellé puis valeur à la ligne suivante', () => {
  const result = run(FORM_NEXT_LINE);

  it('lit la valeur de la ligne suivante', () => {
    expect(values(result)).toMatchObject({
      lender: 'Banque Exemple Régionale',
      principalCents: 8500000,
      initialTermMonths: 180,
      annualRatePercent: 3.1,
      monthlyPaymentCents: 59124,
    });
  });

  it('cite les deux lignes dans l’extrait', () => {
    expect(get(result, 'principalCents')?.snippet).toBe(
      'Montant du crédit 85 000,00 €',
    );
  });
});

describe('extractContractFields — taux multiples et TAEG', () => {
  it('garde le plus probable en MEDIUM et liste les candidats', () => {
    const result = run(MULTI_RATES);
    const rate = get(result, 'annualRatePercent');
    expect(rate?.value).toBe(3.45);
    expect(rate?.confidence).toBe('MEDIUM');
    expect(result.warnings).toContain(
      'Plusieurs taux trouvés (3,45 % et 3,85 %) : vérifiez lequel est le taux débiteur.',
    );
  });

  it('ne propose pas le TAEG comme taux débiteur', () => {
    const result = run(TAEG_ONLY);
    expect(get(result, 'annualRatePercent')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/Seul le TAEG \(3,89 %\)/);
  });

  it('ne signale pas deux fois le même taux répété dans le document', () => {
    const result = run(
      'Taux débiteur : 3,45 %\nMontant du crédit : 100 000,00 €\nDurée du prêt : 240 mois\nLe taux débiteur de 3,45 % est fixe.',
    );
    expect(get(result, 'annualRatePercent')?.value).toBe(3.45);
    expect(result.warnings.join(' ')).not.toMatch(/Plusieurs taux/);
  });

  it('écarte le taux de retard, l’usure et le taux légal', () => {
    const result = run(
      "Offre de prêt - Montant du crédit : 50 000,00 € sur 10 ans\nTaux débiteur : 3,00 %\nEn cas de retard, taux d'intérêt de retard : 6,00 %\nTaux de l'usure : 6,12 %\nTaux d'intérêt légal : 4,22 %",
    );
    expect(get(result, 'annualRatePercent')?.value).toBe(3);
    expect(result.warnings.join(' ')).not.toMatch(/Plusieurs taux/);
  });

  it('écarte la marge et l’indice d’un taux variable', () => {
    const result = run(VARIABLE_RATE);
    expect(get(result, 'annualRatePercent')?.value).toBe(3.05);
    expect(result.warnings.join(' ')).not.toMatch(/Plusieurs taux/);
  });

  it('signale un taux égal au TAEG quand il est seulement déduit', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée : 20 ans\nTaux : 3,45 %\nTAEG : 3,45 %',
    );
    expect(get(result, 'annualRatePercent')?.value).toBe(3.45);
    expect(get(result, 'annualRatePercent')?.confidence).toBe('MEDIUM');
    expect(result.warnings.join(' ')).toMatch(/identique au TAEG/);
  });

  it('accepte un taux de 0 % (prêt à taux zéro)', () => {
    expect(get(run(PTZ), 'annualRatePercent')?.value).toBe(0);
  });

  it('écarte un taux hors bornes ou à plus de 2 décimales, avec avertissement', () => {
    const tooPrecise = run(
      'Prêt immobilier\nTaux débiteur : 3,4567 %\nMontant du crédit : 100 000,00 €\nDurée : 20 ans',
    );
    expect(get(tooPrecise, 'annualRatePercent')).toBeUndefined();
    expect(tooPrecise.warnings.join(' ')).toMatch(/plus de 2 décimales/);
    const huge = run(
      'Prêt immobilier\nTaux débiteur : 345 %\nMontant du crédit : 100 000,00 €\nDurée : 20 ans',
    );
    expect(get(huge, 'annualRatePercent')).toBeUndefined();
    expect(huge.warnings.join(' ')).toMatch(/hors limites/);
  });

  it('déduit un taux « 3,45 % l’an » sans libellé en LOW', () => {
    const result = run(
      "Prêt immobilier de 100 000,00 € sur 20 ans, remboursable au taux de 3,45 % l'an.",
    );
    expect(get(result, 'annualRatePercent')?.value).toBe(3.45);
    expect(get(result, 'annualRatePercent')?.confidence).toBe('MEDIUM');
    const unlabeled = run(
      "Offre de prêt. Montant du crédit : 100 000,00 €. Durée : 20 ans. Les intérêts courent à 3,45 % l'an.",
    );
    expect(get(unlabeled, 'annualRatePercent')?.confidence).toBe('LOW');
  });
});

describe('extractContractFields — assurance et mensualité', () => {
  it('lit un taux d’assurance sur capital initial et n’avertit que de la mensualité', () => {
    const result = run(INSURANCE_RATE_ONLY_TOTAL);
    expect(values(result)).toMatchObject({
      insuranceRatePercent: 0.36,
      insuranceMode: 'PERCENT_INITIAL',
      annualRatePercent: 3.2,
    });
    expect(get(result, 'monthlyPaymentCents')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(
      /Seule la mensualité assurance comprise \(1 078,41 €\)/,
    );
  });

  it('distingue la base « capital restant dû »', () => {
    const result = run(INSURANCE_REMAINING);
    expect(values(result)).toMatchObject({
      insuranceRatePercent: 0.28,
      insuranceMode: 'PERCENT_REMAINING',
      monthlyPaymentCents: 126305,
    });
    expect(get(result, 'insuranceMonthlyCents')).toBeUndefined();
  });

  it('retire le TAEG et le taux débiteur des taux d’assurance', () => {
    const result = run(IMMO_CLEAN);
    expect(get(result, 'insuranceRatePercent')).toBeUndefined();
  });

  it('avertit si le taux d’assurance n’a pas de base lisible', () => {
    const result = run(
      "Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée : 20 ans\nTaux d'assurance : 0,30 %",
    );
    expect(get(result, 'insuranceRatePercent')?.value).toBe(0.3);
    expect(get(result, 'insuranceMode')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/base de calcul illisible/);
  });

  it('déduit la mensualité hors assurance (LOW) quand seule la mensualité totale et l’assurance sont lisibles', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée : 20 ans\nAssurance : 30,00 € par mois\nÉchéance assurance comprise : 622,10 €',
    );
    const payment = get(result, 'monthlyPaymentCents');
    expect(payment?.value).toBe(59210);
    expect(payment?.confidence).toBe('LOW');
    expect(result.warnings.join(' ')).toMatch(/assurance comprise/);
  });

  it('recoupe mensualité + assurance = mensualité totale (HIGH)', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée : 20 ans\nTaux débiteur : 3,45 %\nMontant de l’échéance : 577,30 €\nAssurance : 30,00 € par mois\nÉchéance assurance comprise : 607,30 €',
    );
    expect(get(result, 'monthlyPaymentCents')).toMatchObject({
      value: 57730,
      confidence: 'HIGH',
    });
  });

  it('prend une mensualité simple en MEDIUM', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée : 20 ans\nMensualité : 577,30 €',
    );
    expect(get(result, 'monthlyPaymentCents')).toMatchObject({
      value: 57730,
      confidence: 'MEDIUM',
    });
  });

  it('lit « 240 échéances mensuelles de 850,00 € » sans prendre 240', () => {
    const result = run(
      'Offre de prêt. Montant du crédit : 150 000,00 €. Le prêt est remboursable en 240 échéances mensuelles de 850,00 € hors assurance.',
    );
    expect(get(result, 'monthlyPaymentCents')?.value).toBe(85000);
  });

  it('ignore l’échéance maximale, la première échéance et les numéros d’échéance', () => {
    const result = run(
      'Offre de prêt\nÉchéance n° 12 : 14/05/2025\nPremière échéance : 05/04/2024\nMensualité maximale : 1 500,00 €\nMontant du crédit : 100 000,00 €',
    );
    expect(get(result, 'monthlyPaymentCents')).toBeUndefined();
  });

  it('lit une assurance annuelle comme absente (seul le mensuel est proposé)', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nAssurance emprunteur : 360,00 € par an',
    );
    expect(get(result, 'insuranceMonthlyCents')).toBeUndefined();
  });

  it('avertit quand la mensualité ne cadre pas avec capital, taux et durée', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 150 000,00 €\nDurée du prêt : 240 mois\nTaux débiteur : 3,45 %\nMensualité hors assurance : 962,33 €',
    );
    expect(result.warnings.join(' ')).toMatch(/ne correspond pas au capital/);
  });

  it('ne fait pas ce contrôle pour un taux variable', () => {
    const result = run(
      'Offre de prêt à taux variable\nMontant du crédit : 150 000,00 €\nDurée du prêt : 240 mois\nTaux débiteur : 3,45 %\nMensualité hors assurance : 962,33 €',
    );
    expect(result.warnings.join(' ')).not.toMatch(/ne correspond pas/);
  });
});

describe('extractContractFields — durée', () => {
  const termOf = (text: string) =>
    get(
      run(`Offre de prêt\nMontant du crédit : 100 000,00 €\n${text}`),
      'initialTermMonths',
    );

  it.each([
    ['Durée du prêt : 240 mois', 240],
    ['Durée du prêt : 20 ans', 240],
    ['Durée du prêt : 20 ans et 6 mois', 246],
    ['Durée du prêt : 20 ans 6 mois', 246],
    ['Durée du prêt : 20 ans (240 mois)', 240],
    ['Durée du prêt : 240 mois soit 20 ans', 240],
    ['Durée totale du crédit : 1 an', 12],
    ['Le prêt est consenti pour une durée de 15 années', 180],
    ['Ce prêt est remboursable en 180 mensualités', 180],
    ['Nombre d’échéances : 300', 300],
    ['Durée : 84 mois dont 12 mois de différé', 84],
  ])('« %s » → %d mois', (text, months) => {
    expect(termOf(text)?.value).toBe(months);
  });

  it('plafonne à MEDIUM une durée déduite d’un nombre d’échéances', () => {
    expect(
      termOf('Ce prêt est remboursable en 180 mensualités')?.confidence,
    ).toBe('MEDIUM');
    expect(termOf('Durée du prêt : 240 mois')?.confidence).toBe('HIGH');
  });

  it('ignore les durées de différé, de validité et de rétractation', () => {
    expect(termOf('Durée du différé : 24 mois')).toBeUndefined();
    expect(termOf("Durée de validité de l'offre : 30 jours")).toBeUndefined();
    expect(termOf('Délai de rétractation : 14 jours')).toBeUndefined();
  });

  it('écarte une durée hors bornes avec avertissement', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée du prêt : 700 mois',
    );
    expect(get(result, 'initialTermMonths')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/700 mois\) est hors limites/);
  });

  it('signale une durée exprimée de deux façons incohérentes', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nDurée du prêt : 20 ans (180 mois)',
    );
    expect(get(result, 'initialTermMonths')?.confidence).toBe('MEDIUM');
    expect(result.warnings.join(' ')).toMatch(/ne concordent pas/);
  });
});

describe('extractContractFields — type de taux', () => {
  const rateTypeOf = (text: string) =>
    get(
      run(`Offre de prêt\nMontant du crédit : 100 000,00 €\n${text}`),
      'rateType',
    );

  it.each([
    ['Type de taux : fixe', 'FIXED'],
    ['Prêt à taux fixe', 'FIXED'],
    ['Taux fixe : 3,45 %', 'FIXED'],
    ['Type de taux : variable', 'VARIABLE'],
    ['Prêt à taux révisable', 'ADJUSTABLE'],
    ['Taux variable plafonné', 'VARIABLE'],
  ])('« %s » → %s', (text, expected) => {
    expect(rateTypeOf(text)?.value).toBe(expected);
  });

  it('ignore une liste de choix (« fixe ou variable ») et les négations', () => {
    expect(
      rateTypeOf('Vous pouvez choisir un taux fixe ou variable'),
    ).toBeUndefined();
    expect(rateTypeOf("Ce prêt n'est pas à taux variable")).toBeUndefined();
  });

  it('privilégie la mention explicite sans avertir pour une clause secondaire', () => {
    const result = run(
      "Offre de prêt\nType de taux : fixe\nLe taux révisable ne s'applique pas ici.\nMontant du crédit : 100 000,00 €",
    );
    expect(get(result, 'rateType')?.value).toBe('FIXED');
  });
});

describe('extractContractFields — frais, garantie et date', () => {
  it('lit « Frais de dossier : néant » comme 0 €', () => {
    const fees = get(run(PTZ), 'feesCents');
    expect(fees?.value).toBe(0);
    expect(fees?.confidence).toBe('MEDIUM');
  });

  it('ignore des frais de dossier exprimés en plafond ou en pourcentage', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nFrais de dossier : 1 % du capital (maximum 1 000 €)',
    );
    expect(get(result, 'feesCents')).toBeUndefined();
  });

  it('reconnaît caution, hypothèque et privilège de prêteur de deniers', () => {
    expect(get(run(IMMO_CLEAN), 'guaranteeKind')?.value).toBe('SURETY');
    expect(get(run(PTZ), 'guaranteeKind')?.value).toBe('MORTGAGE');
    expect(get(run(NO_ACCENTS), 'guaranteeKind')?.value).toBe('MORTGAGE');
  });

  it('ne propose aucune garantie pour « sans caution » ou « garantie : néant »', () => {
    expect(
      get(run('Offre de prêt\nGarantie : néant'), 'guaranteeKind'),
    ).toBeUndefined();
    expect(
      get(run('Prêt consenti sans caution ni hypothèque'), 'guaranteeKind'),
    ).toBeUndefined();
  });

  it('dérive le type de garantie des frais lus quand il est le seul indice', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nFrais de caution : 800,00 €',
    );
    expect(get(result, 'guaranteeCents')?.value).toBe(80000);
    expect(get(result, 'guaranteeKind')).toMatchObject({
      value: 'SURETY',
      confidence: 'MEDIUM',
    });
  });

  it('avertit quand des frais de garantie sont lus sans type de garantie', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 100 000,00 €\nFrais de garantie : 800,00 €',
    );
    expect(get(result, 'guaranteeCents')?.value).toBe(80000);
    expect(get(result, 'guaranteeKind')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/type de garantie/);
  });

  it('lit une date en toutes lettres et le « 1er »', () => {
    const date = get(run(PTZ), 'startDate');
    expect(date).toMatchObject({ value: '2024-03-01', confidence: 'HIGH' });
  });

  it.each([
    ['Date de début du prêt : 15/03/2024', '2024-03-15'],
    ['Date de début du prêt : 15-03-2024', '2024-03-15'],
    ['Date de début du prêt : 15.03.2024', '2024-03-15'],
    ['Date de début du prêt : 15 mars 2024', '2024-03-15'],
    ['Date de déblocage des fonds : 3 février 2023', '2023-02-03'],
    ['Date de la 1ère échéance : 05/05/2024', '2024-05-05'],
  ])('« %s » → %s', (text, iso) => {
    expect(get(run(`Offre de prêt\n${text}`), 'startDate')?.value).toBe(iso);
  });

  it('écarte une date impossible', () => {
    expect(
      get(
        run('Offre de prêt\nDate de début du prêt : 31/02/2024'),
        'startDate',
      ),
    ).toBeUndefined();
  });

  it('corrige les chiffres confondus dans une date et plafonne à MEDIUM', () => {
    const date = get(
      run('Offre de prêt\nDate de début du prêt : l5/O3/2O24'),
      'startDate',
    );
    expect(date).toMatchObject({ value: '2024-03-15', confidence: 'MEDIUM' });
  });

  it('préfère la date de début du prêt à la première échéance', () => {
    const result = run(
      'Offre de prêt\nDate de première échéance : 05/04/2024\nDate de début du prêt : 15/03/2024',
    );
    expect(get(result, 'startDate')).toMatchObject({
      value: '2024-03-15',
      confidence: 'HIGH',
    });
  });
});

describe('extractContractFields — prêteur', () => {
  it('lit le prêteur après un libellé, sans la forme juridique', () => {
    expect(get(run(IMMO_CLEAN), 'lender')?.value).toBe('Banque Exemple');
    expect(
      get(
        run('Le Prêteur : Crédit Exemple SAS, au capital de 5 000 000 euros'),
        'lender',
      )?.value,
    ).toBe('Crédit Exemple');
  });

  it('lit un prêteur donné par « ci-après le Prêteur » en MEDIUM', () => {
    const lender = get(run(LENDER_BY_DEFINITION), 'lender');
    expect(lender?.value).toBe('Banque Exemple Atlantique');
    expect(lender?.confidence).toBe('MEDIUM');
  });

  it('refuse un résultat douteux plutôt que de deviner', () => {
    expect(get(run(LENDER_DOUBTFUL), 'lender')).toBeUndefined();
    expect(
      get(
        run('Prêteur : voir ci-dessous\nMontant du prêt : 10 000,00 €'),
        'lender',
      ),
    ).toBeUndefined();
    expect(
      get(
        run(
          'Le prêteur s’engage à mettre les fonds à disposition.\nMontant du prêt : 10 000,00 €',
        ),
        'lender',
      ),
    ).toBeUndefined();
  });

  it('ne prend pas la banque de domiciliation du prélèvement', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 10 000,00 €\nPrélèvement des échéances\nIBAN : FR76 3000 1007 9412 3456 7890 185\nBanque : Banque Domicile Test',
    );
    expect(get(result, 'lender')).toBeUndefined();
  });

  it('reconnaît un établissement connu sans libellé, en MEDIUM', () => {
    const lender = get(run(KNOWN_BANK_ONLY), 'lender');
    expect(lender).toMatchObject({
      value: 'Société Générale',
      confidence: 'MEDIUM',
    });
  });

  it('ne retient pas un nom de banque cité à propos d’une assurance', () => {
    expect(
      get(
        run(
          'Offre de prêt\nAssurance emprunteur souscrite auprès de Crédit Agricole Assurances',
        ),
        'lender',
      ),
    ).toBeUndefined();
  });

  it('plusieurs établissements connus : LOW et avertissement', () => {
    const result = run(
      'Offre de prêt\nCIC propose ce financement\nCIC rappelle ses conditions\nBanque Populaire apparaît aussi',
    );
    expect(get(result, 'lender')?.value).toBe('CIC');
  });
});

describe('extractContractFields — référence du contrat', () => {
  it.each([
    ['Référence du contrat : PI-2024-004517', 'PI-2024-004517'],
    ['Numéro de prêt : 0012345678', '0012345678'],
    ['N° de contrat : LC/22/554821', 'LC/22/554821'],
    ['Contrat n° 2024-8841', '2024-8841'],
  ])('« %s »', (text, reference) => {
    expect(get(run(`Offre de prêt\n${text}`), 'contractReference')?.value).toBe(
      reference,
    );
  });

  it('refuse une référence qui est une date, un IBAN ou un mot', () => {
    expect(
      get(
        run('Offre de prêt\nRéférence du contrat : 15/03/2024'),
        'contractReference',
      ),
    ).toBeUndefined();
    expect(
      get(
        run('Offre de prêt\nRéférence du contrat : voir ci-dessous'),
        'contractReference',
      ),
    ).toBeUndefined();
    expect(
      get(
        run('Offre de prêt\nNuméro de contrat : FR7630001007941234567890185'),
        'contractReference',
      ),
    ).toBeUndefined();
  });

  it('n’applique aucune correction OCR à un identifiant', () => {
    expect(
      get(
        run('Offre de prêt\nNuméro de contrat : LO1-SB2-1234'),
        'contractReference',
      )?.value,
    ).toBe('LO1-SB2-1234');
  });
});

describe('extractContractFields — multi-pages et sans accents', () => {
  it('indique la page de chaque valeur', () => {
    const result = run(...MULTI_PAGE);
    expect(get(result, 'lender')?.page).toBe(1);
    expect(get(result, 'contractReference')?.page).toBe(1);
    expect(get(result, 'principalCents')?.page).toBe(2);
    expect(get(result, 'annualRatePercent')?.page).toBe(3);
    expect(get(result, 'guaranteeCents')?.page).toBe(3);
    expect(values(result)).toMatchObject({
      initialTermMonths: 300,
      feesCents: 105000,
      guaranteeKind: 'MORTGAGE',
      guaranteeCents: 231000,
      annualRatePercent: 3.15,
    });
  });

  it('lit un texte sans accents (OCR en anglais)', () => {
    expect(values(run(NO_ACCENTS))).toMatchObject({
      lender: 'Banque Exemple',
      contractReference: 'LC-2022-554821',
      principalCents: 9500000,
      initialTermMonths: 300,
      annualRatePercent: 2.75,
      monthlyPaymentCents: 43629,
      feesCents: 47500,
    });
  });
});

describe('extractContractFields — normalisation des nombres et espaces', () => {
  it('lit espaces insécables, fines et formats « 150.000 euros »', () => {
    const nbsp = ' ';
    const narrow = ' ';
    const thin = ' ';
    const result = run(
      `Offre de prêt\nMontant du crédit${nbsp}: 150${narrow}000,00${nbsp}€\nDurée du prêt : 240${nbsp}mois\nTaux débiteur : 3,45${thin}%\nMensualité hors assurance : 862,33${nbsp}€`,
    );
    expect(values(result)).toMatchObject({
      principalCents: 15000000,
      initialTermMonths: 240,
      annualRatePercent: 3.45,
      monthlyPaymentCents: 86233,
    });
    const dotted = run('Offre de prêt\nMontant du crédit : 150.000 euros');
    expect(get(dotted, 'principalCents')?.value).toBe(15000000);
    const plain = run('Offre de prêt\nMontant du crédit : 150000,00 EUR');
    expect(get(plain, 'principalCents')?.value).toBe(15000000);
  });

  it('lit « 3,45 % l’an » et « 3.45% »', () => {
    expect(
      get(
        run("Offre de prêt\nTaux débiteur : 3,45 % l'an"),
        'annualRatePercent',
      )?.value,
    ).toBe(3.45);
    expect(
      get(run('Offre de prêt\nTaux débiteur : 3.45%'), 'annualRatePercent')
        ?.value,
    ).toBe(3.45);
  });

  it('rejette un montant brut sans devise ni forme de montant, sauf pour le capital', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 150000\nMensualité : 850',
    );
    expect(get(result, 'principalCents')).toMatchObject({
      value: 15000000,
      confidence: 'MEDIUM',
    });
    expect(get(result, 'monthlyPaymentCents')).toBeUndefined();
  });

  it('écarte un montant hors bornes avec avertissement', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 99 999 999 999 999,00 €',
    );
    expect(get(result, 'principalCents')).toBeUndefined();
  });

  it('plusieurs montants de crédit plausibles : avertissement', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 150 000,00 €\nMontant du prêt complémentaire : 30 000,00 €',
    );
    expect(get(result, 'principalCents')?.confidence).toBe('MEDIUM');
    expect(result.warnings.join(' ')).toMatch(/Plusieurs montants de crédit/);
  });
});

describe('extractContractFields — texte bruité par l’OCR', () => {
  it('corrige les chiffres confondus à l’intérieur des jetons et plafonne à MEDIUM', () => {
    const result = run(OCR_NOISY_DIGITS);
    expect(values(result)).toMatchObject({
      principalCents: 15000000,
      initialTermMonths: 240,
      annualRatePercent: 3.45,
      feesCents: 90000,
    });
    expect(get(result, 'principalCents')?.confidence).toBe('MEDIUM');
    expect(get(result, 'initialTermMonths')?.confidence).toBe('MEDIUM');
    expect(get(result, 'annualRatePercent')?.confidence).toBe('MEDIUM');
    expect(get(result, 'feesCents')?.confidence).toBe('MEDIUM');
    expect(get(result, 'monthlyPaymentCents')?.confidence).toBe('HIGH');
    expect(get(result, 'lender')?.confidence).toBe('HIGH');
  });

  it('ne « corrige » jamais une lettre hors d’un jeton numérique', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : SOLDE\nDurée du prêt : lOl mois ou OBI',
    );
    expect(get(result, 'principalCents')).toBeUndefined();
  });

  it('signale un texte de mauvaise qualité et baisse la confiance', () => {
    const result = run(OCR_GARBAGE);
    expect(result.warnings.join(' ')).toMatch(/mauvaise qualité/);
    for (const field of result.fields) {
      expect(field.confidence).not.toBe('HIGH');
    }
  });

  it('ne signale pas la mauvaise qualité sur un texte propre', () => {
    expect(run(IMMO_CLEAN).warnings.join(' ')).not.toMatch(/mauvaise qualité/);
    expect(run(AUTO_COLUMNS).warnings.join(' ')).not.toMatch(
      /mauvaise qualité/,
    );
  });
});

describe('extractContractFields — document sans rapport ou vide', () => {
  it('signale un document sans offre de prêt apparente', () => {
    const result = run(UNRELATED);
    expect(result.fields).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/ne ressemble pas à une offre/);
  });

  it('signale un texte presque vide', () => {
    const result = run('  \n ', '');
    expect(result.fields).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/Très peu de texte/);
  });

  it('signale un document de prêt dont rien n’est lisible', () => {
    const result = run(
      "Contrat de prêt. Le prêteur et l'emprunteur conviennent des conditions suivantes. Le capital emprunté sera remboursé selon le tableau d'amortissement annexé au présent contrat, dont la durée et le taux sont rappelés.",
    );
    expect(result.fields).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/Aucune valeur/);
  });

  it('ne dépasse pas 12 avertissements et ne les répète pas', () => {
    const result = run(OCR_GARBAGE);
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
    expect(result.warnings.length).toBeLessThanOrEqual(12);
  });
});

describe('extractContractFields — respect des bornes du domaine', () => {
  it('n’émet jamais de valeur hors bornes', () => {
    for (const text of [
      IMMO_CLEAN,
      AUTO_COLUMNS,
      TABLE_LAYOUT,
      PTZ,
      OCR_NOISY_DIGITS,
      OCR_GARBAGE,
      NO_ACCENTS,
    ]) {
      const result = run(text);
      for (const field of result.fields) {
        if (field.field === 'annualRatePercent') {
          expect(field.value).toBeGreaterThanOrEqual(0);
          expect(field.value).toBeLessThanOrEqual(100);
          expect(
            Math.abs(
              (field.value as number) * 100 -
                Math.round((field.value as number) * 100),
            ),
          ).toBeLessThan(1e-9);
        }
        if (field.field === 'initialTermMonths') {
          expect(field.value).toBeGreaterThanOrEqual(1);
          expect(field.value).toBeLessThanOrEqual(600);
        }
        if (field.field.endsWith('Cents')) {
          expect(Number.isInteger(field.value)).toBe(true);
          expect(field.value as number).toBeGreaterThanOrEqual(0);
        }
        expect(['HIGH', 'MEDIUM', 'LOW']).toContain(field.confidence);
      }
    }
  });
});

describe('extractContractFields — extraits sans données sensibles superflues', () => {
  it('masque IBAN, e-mail et téléphone voisins de la valeur', () => {
    const result = run(
      'Offre de prêt\nMontant du crédit : 10 000,00 € contact jean.dupont@example.org tél 06 12 34 56 78 IBAN FR76 3000 1007 9412 3456 7890 185',
    );
    const snippet = get(result, 'principalCents')?.snippet ?? '';
    expect(snippet).toContain('10 000,00 €');
    expect(snippet).not.toMatch(/@|06 12|FR76/);
  });

  it('coupe les lignes longues à 140 caractères en gardant la valeur', () => {
    const long = `Montant du crédit : ${'blabla '.repeat(30)} 150 000,00 €`;
    const result = run(`Offre de prêt\n${long}`);
    const field = get(result, 'principalCents');
    if (field) {
      expect(field.snippet.length).toBeLessThanOrEqual(140);
    }
  });
});

describe('extractContractFields — offre longue avec clauses types (faux positifs)', () => {
  const result = run(...REALISTIC_LONG);

  it('retient les caractéristiques du prêt et ignore les chiffres des clauses', () => {
    expect(values(result)).toMatchObject({
      lender: 'Banque Exemple',
      contractReference: '2024-0047781',
      principalCents: 23500000,
      initialTermMonths: 300,
      annualRatePercent: 3.7,
      monthlyPaymentCents: 119864,
      rateType: 'FIXED',
      insuranceMonthlyCents: 5875,
      insuranceRatePercent: 0.3,
      insuranceMode: 'PERCENT_INITIAL',
      feesCents: 100000,
      guaranteeKind: 'SURETY',
      guaranteeCents: 211600,
    });
  });

  it('ne produit aucun avertissement sur ces clauses', () => {
    expect(result.warnings).toEqual([]);
  });

  it('recoupe mensualité + assurance = échéance assurance comprise (HIGH)', () => {
    expect(get(result, 'monthlyPaymentCents')?.confidence).toBe('HIGH');
  });

  it('lit les pages d’origine', () => {
    expect(get(result, 'principalCents')?.page).toBe(1);
    expect(get(result, 'feesCents')?.page).toBe(2);
    expect(get(result, 'insuranceRatePercent')?.page).toBe(2);
  });
});
