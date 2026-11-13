import { describe, expect, it } from 'vitest';
import {
  rawExtractedField,
  rawExtractionJob,
  rawExtractionResult,
} from '../test/fixtures';
import { emptyDebtForm } from './debt';
import {
  applyExtractedFields,
  clearPrefillMark,
  contractFileError,
  describeExtractionFailure,
  describeExtractionStage,
  describePrefill,
  ExtractedField,
  extractedFieldProblem,
  formatExtractedValue,
  formatFileSize,
  isCheckedByDefault,
  isFormUntouched,
  missingFieldLabels,
  nextPollDelayMs,
  parseExtractionCapabilities,
  parseExtractionJob,
  parseExtractionResult,
  parseExtractionStart,
} from './debt-extraction';

const NOW = new Date(2026, 10, 1, 12, 0, 0);
const form = () => emptyDebtForm(NOW);

/** Un champ déjà lu (le résultat du parsing), pour tester l'application. */
function field(
  name: string,
  value: string | number,
  confidence: ExtractedField['confidence'] = 'HIGH',
): ExtractedField {
  const parsed = parseExtractionResult({
    fields: [rawExtractedField(name, value, confidence)],
  });
  const found = parsed?.fields[0];
  if (!found) {
    throw new Error(`champ illisible : ${name}`);
  }
  return found;
}

describe('parseExtractionCapabilities', () => {
  it('reads the capabilities and only trusts available: true', () => {
    expect(
      parseExtractionCapabilities({
        available: true,
        engines: ['tesseract'],
        maxFileBytes: 5242880,
        maxPages: 40,
      }),
    ).toEqual({ available: true, maxFileBytes: 5242880, maxPages: 40 });
    expect(parseExtractionCapabilities({ available: 'true' }).available).toBe(
      false,
    );
    expect(parseExtractionCapabilities({ available: 1 }).available).toBe(false);
    expect(parseExtractionCapabilities(null)).toEqual({
      available: false,
      maxFileBytes: 10485760,
      maxPages: null,
    });
    expect(parseExtractionCapabilities('nope').available).toBe(false);
  });

  it('falls back to the default size limit when it is unreadable', () => {
    expect(
      parseExtractionCapabilities({ available: true, maxFileBytes: -5 })
        .maxFileBytes,
    ).toBe(10485760);
    expect(
      parseExtractionCapabilities({ available: true, maxFileBytes: 'big' })
        .maxFileBytes,
    ).toBe(10485760);
  });
});

describe('parseExtractionStart', () => {
  it('reads the job id and the expiry', () => {
    expect(
      parseExtractionStart({
        jobId: 'j1',
        expiresAt: '2026-11-01T12:15:00.000Z',
      }),
    ).toEqual({
      jobId: 'j1',
      expiresAtMs: Date.parse('2026-11-01T12:15:00.000Z'),
    });
    expect(parseExtractionStart({ jobId: 'j1', expiresAt: 'demain' })).toEqual({
      jobId: 'j1',
      expiresAtMs: null,
    });
  });

  it('refuses a response without a usable job id', () => {
    expect(parseExtractionStart({})).toBeNull();
    expect(parseExtractionStart({ jobId: 12 })).toBeNull();
    expect(parseExtractionStart({ jobId: '  ' })).toBeNull();
    expect(parseExtractionStart(null)).toBeNull();
  });
});

describe('parseExtractionResult', () => {
  it('reads a full result and orders the fields for display', () => {
    const result = parseExtractionResult(rawExtractionResult());
    expect(result?.source).toBe('OCR');
    expect(result?.pages).toBe(12);
    expect(result?.fields.map((item) => item.field)).toEqual([
      'lender',
      'principalCents',
      'annualRatePercent',
      'monthlyPaymentCents',
      'initialTermMonths',
    ]);
    expect(result?.fields[1]).toEqual({
      field: 'principalCents',
      value: 15000000,
      confidence: 'HIGH',
      snippet: 'Montant du crédit : 150 000,00 €',
      page: 2,
    });
    expect(result?.warnings).toEqual([
      'Plusieurs taux trouvés (3,45 % et 3,85 %) : vérifiez lequel est le taux débiteur.',
    ]);
  });

  it('ignores unknown fields and unknown properties', () => {
    const result = parseExtractionResult({
      fields: [
        rawExtractedField('lender', 'LCL'),
        rawExtractedField('iban', 'FR76 1234', 'HIGH'),
        { field: 'taeg', value: 4.1, confidence: 'HIGH' },
        'nope',
        null,
        12,
      ],
      futur: true,
    });
    expect(result?.fields.map((item) => item.field)).toEqual(['lender']);
  });

  it('drops a value of the wrong type instead of converting it', () => {
    const result = parseExtractionResult({
      fields: [
        rawExtractedField('principalCents', '150000'),
        rawExtractedField('annualRatePercent', 'trois'),
        rawExtractedField('initialTermMonths', 240.5),
        rawExtractedField('monthlyPaymentCents', -10),
        rawExtractedField('lender', 42),
        rawExtractedField('lender', '   '),
        rawExtractedField('rateType', 'FLOTTANT'),
        rawExtractedField('insuranceMode', 'AUTRE'),
        rawExtractedField('guaranteeKind', 'NONE'),
        rawExtractedField('startDate', '2026-02-30'),
        rawExtractedField('startDate', 20260101),
        rawExtractedField('feesCents', Number.NaN),
      ],
    });
    expect(result?.fields).toEqual([]);
  });

  it('treats a missing or unknown confidence as the lowest one, never as sure', () => {
    const result = parseExtractionResult({
      fields: [
        { field: 'lender', value: 'LCL' },
        { field: 'contractReference', value: 'X1', confidence: 'CERTAIN' },
        { field: 'feesCents', value: 100, confidence: 'high' },
      ],
    });
    expect(result?.fields.map((item) => item.confidence)).toEqual([
      'LOW',
      'LOW',
      'LOW',
    ]);
  });

  it('keeps one value per field, the most reliable one', () => {
    const result = parseExtractionResult({
      fields: [
        rawExtractedField('annualRatePercent', 3.9, 'LOW'),
        rawExtractedField('annualRatePercent', 3.45, 'HIGH'),
        rawExtractedField('annualRatePercent', 9, 'HIGH'),
      ],
    });
    expect(result?.fields).toHaveLength(1);
    expect(result?.fields[0]).toMatchObject({
      value: 3.45,
      confidence: 'HIGH',
    });
  });

  it('normalises the snippet and the page, and tolerates their absence', () => {
    const result = parseExtractionResult({
      fields: [
        rawExtractedField('lender', 'LCL', 'HIGH', {
          snippet: '  Prêteur :\n  LCL   ',
          page: 0,
        }),
        rawExtractedField('feesCents', 90000, 'HIGH', {
          snippet: 12,
          page: '3',
        }),
        { field: 'contractReference', value: 'R1', confidence: 'HIGH' },
      ],
    });
    expect(result?.fields[0]).toMatchObject({
      snippet: 'Prêteur : LCL',
      page: null,
    });
    expect(result?.fields[1]).toMatchObject({ snippet: null, page: null });
    expect(result?.fields[2]).toMatchObject({ snippet: null, page: null });
    expect(result?.fields[1].field).toBe('contractReference');
  });

  it('keeps only readable warnings', () => {
    const result = parseExtractionResult({
      fields: [],
      warnings: ['Texte flou', '', 7, null, '  Deux taux  '],
    });
    expect(result?.warnings).toEqual(['Texte flou', 'Deux taux']);
    expect(
      parseExtractionResult({ fields: 'oops', warnings: 'oops' }),
    ).toMatchObject({ fields: [], warnings: [] });
  });

  it('refuses something that is not an object', () => {
    expect(parseExtractionResult(null)).toBeNull();
    expect(parseExtractionResult('x')).toBeNull();
    expect(parseExtractionResult([])).toBeNull();
  });
});

describe('parseExtractionJob', () => {
  it('reads a running job', () => {
    expect(parseExtractionJob(rawExtractionJob())).toEqual({
      status: 'RUNNING',
      stage: 'OCR',
      progressPercent: 40,
      result: null,
      errorMessage: null,
    });
  });

  it('only reads the result of a finished job', () => {
    expect(
      parseExtractionJob(
        rawExtractionJob({ status: 'RUNNING', result: rawExtractionResult() }),
      )?.result,
    ).toBeNull();
    expect(
      parseExtractionJob(
        rawExtractionJob({
          status: 'DONE',
          stage: null,
          progressPercent: 100,
          result: rawExtractionResult(),
        }),
      )?.result?.fields,
    ).toHaveLength(5);
    expect(
      parseExtractionJob(rawExtractionJob({ status: 'DONE', result: 'x' })),
    ).toMatchObject({ status: 'DONE', result: null, progressPercent: 40 });
  });

  it('clamps the progress and reads the failure message', () => {
    expect(
      parseExtractionJob(rawExtractionJob({ progressPercent: 180 }))
        ?.progressPercent,
    ).toBe(100);
    expect(
      parseExtractionJob(rawExtractionJob({ progressPercent: -4 }))
        ?.progressPercent,
    ).toBe(0);
    expect(
      parseExtractionJob(
        rawExtractionJob({ progressPercent: 'x', stage: 'WAT' }),
      ),
    ).toMatchObject({ progressPercent: 0, stage: null });
    expect(
      parseExtractionJob({
        status: 'FAILED',
        error: { message: 'PDF protégé.' },
      }),
    ).toMatchObject({ status: 'FAILED', errorMessage: 'PDF protégé.' });
    expect(
      parseExtractionJob({ status: 'FAILED', error: 'x' })?.errorMessage,
    ).toBeNull();
  });

  it('refuses an unknown status or a body that is not an object', () => {
    expect(parseExtractionJob({ status: 'PAUSED' })).toBeNull();
    expect(parseExtractionJob(null)).toBeNull();
    expect(parseExtractionJob('DONE')).toBeNull();
  });
});

describe('display', () => {
  it('formats every kind of value for reading', () => {
    expect(formatExtractedValue(field('lender', 'Banque Exemple'))).toBe(
      'Banque Exemple',
    );
    expect(
      formatExtractedValue(field('principalCents', 15000000)).replace(
        /\s/g,
        ' ',
      ),
    ).toBe('150 000 €');
    expect(
      formatExtractedValue(field('monthlyPaymentCents', 85450)).replace(
        /\s/g,
        ' ',
      ),
    ).toBe('854,50 €');
    expect(
      formatExtractedValue(field('annualRatePercent', 3.45)).replace(
        /\s/g,
        ' ',
      ),
    ).toBe('3,45 %');
    expect(formatExtractedValue(field('initialTermMonths', 240))).toBe(
      '240 mois (20 ans)',
    );
    expect(formatExtractedValue(field('rateType', 'ADJUSTABLE'))).toBe(
      'Révisable',
    );
    expect(
      formatExtractedValue(field('insuranceMode', 'PERCENT_REMAINING')),
    ).toBe('% du capital restant dû');
    expect(formatExtractedValue(field('guaranteeKind', 'SURETY'))).toBe(
      'Caution',
    );
    expect(formatExtractedValue(field('startDate', '2026-10-30'))).toBe(
      '30 octobre 2026',
    );
  });

  it('only checks the values that are sure by default', () => {
    expect(isCheckedByDefault('HIGH')).toBe(true);
    expect(isCheckedByDefault('MEDIUM')).toBe(false);
    expect(isCheckedByDefault('LOW')).toBe(false);
  });

  it('names the stage in French', () => {
    expect(describeExtractionStage({ status: 'RUNNING', stage: 'TEXT' })).toBe(
      'Lecture du texte',
    );
    expect(describeExtractionStage({ status: 'RUNNING', stage: 'OCR' })).toBe(
      'Reconnaissance des caractères',
    );
    expect(
      describeExtractionStage({ status: 'RUNNING', stage: 'PARSING' }),
    ).toBe('Analyse');
    expect(describeExtractionStage({ status: 'PENDING', stage: null })).toBe(
      'En attente de démarrage',
    );
    expect(describeExtractionStage({ status: 'RUNNING', stage: null })).toBe(
      'Lecture en cours',
    );
  });

  it('lists what was not found, grouping insurance and guarantee', () => {
    const labels = missingFieldLabels(
      parseExtractionResult(rawExtractionResult())?.fields ?? [],
    );
    expect(labels).toEqual([
      'Référence du contrat',
      'Type de taux',
      'Date de début',
      'Assurance',
      'Frais de dossier',
      'Garantie',
    ]);
    expect(
      missingFieldLabels([field('insuranceRatePercent', 0.3)]),
    ).not.toContain('Assurance');
    expect(missingFieldLabels([field('guaranteeCents', 150000)])).not.toContain(
      'Garantie',
    );
    expect(missingFieldLabels([])).toContain('Prêteur');
  });
});

describe('extractedFieldProblem', () => {
  it('accepts values inside the limits of the form', () => {
    for (const item of [
      field('principalCents', 15000000),
      field('annualRatePercent', 0),
      field('annualRatePercent', 100),
      field('initialTermMonths', 600),
      field('insuranceRatePercent', 20),
      field('feesCents', 0),
    ]) {
      expect(extractedFieldProblem(item), item.field).toBeNull();
    }
  });

  it('rejects values the form would refuse', () => {
    for (const item of [
      field('principalCents', 0),
      field('principalCents', 2_000_000_000),
      field('monthlyPaymentCents', 0),
      field('annualRatePercent', 101),
      field('annualRatePercent', 3.456),
      field('insuranceRatePercent', 25),
      field('initialTermMonths', 0),
      field('initialTermMonths', 601),
      field('lender', 'x'.repeat(81)),
      field('contractReference', 'x'.repeat(61)),
    ]) {
      expect(extractedFieldProblem(item), `${item.field} ${item.value}`).toBe(
        'valeur hors des limites du formulaire',
      );
    }
  });
});

describe('applyExtractedFields', () => {
  it('fills only the fields it is given and leaves everything else untouched', () => {
    const before = form();
    const result = applyExtractedFields(before, [
      field('lender', 'Banque Exemple'),
      field('principalCents', 15000000),
    ]);
    expect(result.values).toEqual({
      ...before,
      lender: 'Banque Exemple',
      principal: '150000',
    });
    expect(result.applied).toEqual(['lender', 'principalCents']);
    expect(result.skipped).toEqual([]);
    expect(result.marks).toEqual({ lender: 'HIGH', principal: 'HIGH' });
    expect(before.lender).toBe('');
  });

  it('never invents the fields that were not found: they stay empty', () => {
    const result = applyExtractedFields(form(), [field('lender', 'LCL')]);
    expect(result.values.principal).toBe('');
    expect(result.values.remaining).toBe('');
    expect(result.values.rate).toBe('');
    expect(result.values.monthlyPayment).toBe('');
    expect(result.values.name).toBe('');
    expect(result.values.termMonths).toBe('');
    expect(result.values.rateType).toBe('');
  });

  it('applies nothing when nothing is chosen', () => {
    const before = form();
    const result = applyExtractedFields(before, []);
    expect(result.values).toEqual(before);
    expect(result.applied).toEqual([]);
    expect(result.marks).toEqual({});
  });

  it('converts amounts, rates, dates and the rate type with the domain conversions', () => {
    const result = applyExtractedFields(form(), [
      field('principalCents', 15000050),
      field('monthlyPaymentCents', 85400),
      field('annualRatePercent', 3.45),
      field('rateType', 'VARIABLE'),
      field('startDate', '2026-10-30'),
      field('contractReference', 'PRET-12345'),
      field('feesCents', 90000),
    ]);
    expect(result.values).toMatchObject({
      principal: '150000,50',
      monthlyPayment: '854',
      rate: '3,45',
      rateType: 'VARIABLE',
      startDate: '2026-10-30',
      contractReference: 'PRET-12345',
      fees: '900',
    });
  });

  it('puts the term in years and months from one year, in months below', () => {
    expect(
      applyExtractedFields(form(), [field('initialTermMonths', 242)]).values,
    ).toMatchObject({
      termUnit: 'YEARS',
      termYears: '20',
      termExtraMonths: '2',
      termMonths: '',
    });
    expect(
      applyExtractedFields(form(), [field('initialTermMonths', 240)]).values,
    ).toMatchObject({
      termUnit: 'YEARS',
      termYears: '20',
      termExtraMonths: '',
    });
    expect(
      applyExtractedFields(form(), [field('initialTermMonths', 9)]).values,
    ).toMatchObject({ termUnit: 'MONTHS', termMonths: '9', termYears: '' });
    expect(
      applyExtractedFields(form(), [field('initialTermMonths', 9)]).marks,
    ).toEqual({ term: 'HIGH' });
  });

  it('ignores a value outside the bounds of the form and says so', () => {
    const result = applyExtractedFields(form(), [
      field('annualRatePercent', 140),
      field('lender', 'LCL'),
      field('initialTermMonths', 900, 'MEDIUM'),
    ]);
    expect(result.values.rate).toBe('');
    expect(result.values.termMonths).toBe('');
    expect(result.values.termYears).toBe('');
    expect(result.values.lender).toBe('LCL');
    expect(result.applied).toEqual(['lender']);
    expect(result.skipped).toEqual([
      {
        field: 'annualRatePercent',
        label: 'Taux annuel',
        reason: 'valeur hors des limites du formulaire',
      },
      {
        field: 'initialTermMonths',
        label: 'Durée initiale',
        reason: 'valeur hors des limites du formulaire',
      },
    ]);
    expect(result.marks).toEqual({ lender: 'HIGH' });
  });

  it('keeps the confidence of each applied field in its mark', () => {
    const result = applyExtractedFields(form(), [
      field('lender', 'LCL', 'HIGH'),
      field('annualRatePercent', 3.9, 'MEDIUM'),
      field('monthlyPaymentCents', 32000, 'LOW'),
    ]);
    expect(result.marks).toEqual({
      lender: 'HIGH',
      rate: 'MEDIUM',
      monthlyPayment: 'LOW',
    });
  });

  describe('insurance', () => {
    it('puts a fixed monthly amount in the fixed mode', () => {
      const result = applyExtractedFields(form(), [
        field('insuranceMode', 'FIXED'),
        field('insuranceMonthlyCents', 2350),
      ]);
      expect(result.values).toMatchObject({
        insuranceMode: 'FIXED',
        insurance: '23,50',
      });
      expect(result.marks).toEqual({
        insuranceMode: 'HIGH',
        insurance: 'HIGH',
      });
    });

    it('infers the fixed mode from a monthly amount alone and switches a percent form back to it', () => {
      const percent = { ...form(), insuranceMode: 'PERCENT_INITIAL' as const };
      expect(
        applyExtractedFields(form(), [field('insuranceMonthlyCents', 2350)])
          .values,
      ).toMatchObject({ insuranceMode: 'FIXED', insurance: '23,50' });
      const switched = applyExtractedFields(percent, [
        field('insuranceMonthlyCents', 2350, 'MEDIUM'),
      ]);
      expect(switched.values.insuranceMode).toBe('FIXED');
      expect(switched.marks).toEqual({
        insuranceMode: 'MEDIUM',
        insurance: 'MEDIUM',
      });
    });

    it('puts a rate in the percent mode that was read with it', () => {
      const result = applyExtractedFields(form(), [
        field('insuranceMode', 'PERCENT_REMAINING'),
        field('insuranceRatePercent', 0.36),
      ]);
      expect(result.values).toMatchObject({
        insuranceMode: 'PERCENT_REMAINING',
        insuranceRate: '0,36',
        insurance: '',
        insuranceQuotity: '100',
      });
      expect(result.marks).toEqual({
        insuranceMode: 'HIGH',
        insuranceRate: 'HIGH',
      });
    });

    it('does not guess the mode from a rate alone: it is left out with an explanation', () => {
      const result = applyExtractedFields(form(), [
        field('insuranceRatePercent', 0.36),
      ]);
      expect(result.values.insuranceRate).toBe('');
      expect(result.values.insuranceMode).toBe('FIXED');
      expect(result.applied).toEqual([]);
      expect(result.skipped[0]).toMatchObject({
        field: 'insuranceRatePercent',
        label: 'Taux de l’assurance',
      });
      expect(result.skipped[0].reason).toContain(
        'choisissez d’abord comment l’assurance est calculée',
      );
    });

    it('takes a rate alone when the form already has a percent mode', () => {
      const result = applyExtractedFields(
        { ...form(), insuranceMode: 'PERCENT_INITIAL' },
        [field('insuranceRatePercent', 0.3)],
      );
      expect(result.values).toMatchObject({
        insuranceMode: 'PERCENT_INITIAL',
        insuranceRate: '0,3',
      });
    });

    it('leaves out the figure that does not fit the mode', () => {
      const fixed = applyExtractedFields(form(), [
        field('insuranceMode', 'FIXED'),
        field('insuranceRatePercent', 0.3),
      ]);
      expect(fixed.values.insuranceRate).toBe('');
      expect(fixed.skipped.map((item) => item.field)).toEqual([
        'insuranceRatePercent',
      ]);
      const percent = applyExtractedFields(form(), [
        field('insuranceMode', 'PERCENT_INITIAL'),
        field('insuranceMonthlyCents', 2000),
      ]);
      expect(percent.values.insurance).toBe('');
      expect(percent.skipped.map((item) => item.field)).toEqual([
        'insuranceMonthlyCents',
      ]);
      expect(percent.applied).toEqual(['insuranceMode']);
    });

    it('ignores an insurance rate above the limit of the form', () => {
      const result = applyExtractedFields(form(), [
        field('insuranceMode', 'PERCENT_INITIAL'),
        field('insuranceRatePercent', 35),
      ]);
      expect(result.values.insuranceRate).toBe('');
      expect(result.skipped.map((item) => item.field)).toEqual([
        'insuranceRatePercent',
      ]);
    });
  });

  describe('guarantee', () => {
    it('applies the kind and the amount together', () => {
      const result = applyExtractedFields(form(), [
        field('guaranteeKind', 'MORTGAGE'),
        field('guaranteeCents', 150000),
      ]);
      expect(result.values).toMatchObject({
        guaranteeKind: 'MORTGAGE',
        guarantee: '1500',
      });
      expect(result.marks).toEqual({
        guaranteeKind: 'HIGH',
        guarantee: 'HIGH',
      });
    });

    it('never puts an amount without a kind, which the form would refuse', () => {
      const result = applyExtractedFields(form(), [
        field('guaranteeCents', 150000),
      ]);
      expect(result.values.guarantee).toBe('');
      expect(result.values.guaranteeKind).toBe('NONE');
      expect(result.skipped[0].field).toBe('guaranteeCents');
    });

    it('applies the kind alone', () => {
      expect(
        applyExtractedFields(form(), [field('guaranteeKind', 'SURETY')]).values,
      ).toMatchObject({ guaranteeKind: 'SURETY', guarantee: '' });
    });
  });

  it('describes what was filled in', () => {
    expect(describePrefill({ applied: [], skipped: [] })).toBe(
      'Aucune information n’a été reprise dans le formulaire.',
    );
    expect(describePrefill({ applied: ['lender'], skipped: [] })).toContain(
      '1 information a été reprise',
    );
    expect(
      describePrefill({ applied: ['lender', 'feesCents'], skipped: [] }),
    ).toContain('2 informations ont été reprises');
    expect(describePrefill({ applied: ['lender'], skipped: [] })).toContain(
      'rien n’est enregistré',
    );
  });
});

describe('prefill marks', () => {
  it('removes the mark of the field being edited, and only that one', () => {
    const marks = { rate: 'HIGH', term: 'MEDIUM', lender: 'HIGH' } as const;
    expect(clearPrefillMark(marks, 'rate')).toEqual({
      term: 'MEDIUM',
      lender: 'HIGH',
    });
    expect(clearPrefillMark(marks, 'termYears')).toEqual({
      rate: 'HIGH',
      lender: 'HIGH',
    });
    expect(clearPrefillMark(marks, 'termUnit')).toEqual({
      rate: 'HIGH',
      lender: 'HIGH',
    });
  });

  it('keeps the same object when there is nothing to remove', () => {
    const marks = { rate: 'HIGH' } as const;
    expect(clearPrefillMark(marks, 'principal')).toBe(marks);
    expect(clearPrefillMark(marks, 'notes')).toBe(marks);
  });
});

describe('isFormUntouched', () => {
  it('tells a pristine form from one with something typed', () => {
    expect(isFormUntouched(form(), form())).toBe(true);
    expect(isFormUntouched({ ...form(), name: 'Prêt' }, form())).toBe(false);
    expect(
      isFormUntouched({ ...form(), insuranceMode: 'PERCENT_INITIAL' }, form()),
    ).toBe(false);
  });
});

describe('contractFileError', () => {
  const pdf = { name: 'contrat.pdf', type: 'application/pdf', size: 2_000_000 };
  const max = 10 * 1024 * 1024;

  it('accepts a PDF, a PNG and a JPEG within the size limit', () => {
    expect(contractFileError(pdf, max)).toBeNull();
    expect(
      contractFileError({ name: 'a.png', type: 'image/png', size: 10 }, max),
    ).toBeNull();
    expect(
      contractFileError({ name: 'a.jpg', type: 'image/jpeg', size: 10 }, max),
    ).toBeNull();
    expect(contractFileError({ ...pdf, size: max }, max)).toBeNull();
  });

  it('falls back to the extension when the browser gives no type', () => {
    expect(
      contractFileError({ name: 'SCAN.JPEG', type: '', size: 10 }, max),
    ).toBeNull();
    expect(
      contractFileError({ name: 'scan', type: '', size: 10 }, max),
    ).toContain('pas pris en charge');
  });

  it('refuses other types with a clear message', () => {
    expect(
      contractFileError(
        {
          name: 'notes.docx',
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 10,
        },
        max,
      ),
    ).toBe(
      'Ce type de fichier n’est pas pris en charge. Choisissez un PDF, une image PNG ou une photo JPEG.',
    );
    expect(
      contractFileError(
        { name: 'releve.csv', type: 'text/csv', size: 10 },
        max,
      ),
    ).toContain('pas pris en charge');
  });

  it('explains the HEIC case apart', () => {
    expect(
      contractFileError(
        { name: 'IMG_1.HEIC', type: 'image/heic', size: 10 },
        max,
      ),
    ).toContain('HEIC');
    expect(
      contractFileError({ name: 'IMG_1.heic', type: '', size: 10 }, max),
    ).toContain('HEIC');
  });

  it('refuses an empty file and a file that is too big, with the sizes', () => {
    expect(contractFileError({ ...pdf, size: 0 }, max)).toBe(
      'Ce fichier est vide. Choisissez-en un autre.',
    );
    const tooBig = contractFileError({ ...pdf, size: max + 1 }, max);
    expect(tooBig).toContain('trop volumineux');
    expect(tooBig).toContain('10 Mo');
  });

  it('formats sizes', () => {
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10 Mo');
    expect(formatFileSize(1_572_864)).toBe('1,5 Mo');
    expect(formatFileSize(300 * 1024)).toBe('300 Ko');
    expect(formatFileSize(10)).toBe('1 Ko');
  });
});

describe('polling and failures', () => {
  it('starts at 1.5 s, then backs off up to a ceiling', () => {
    expect(nextPollDelayMs(0)).toBe(1500);
    expect(nextPollDelayMs(4)).toBe(1500);
    expect(nextPollDelayMs(5)).toBe(2000);
    expect(nextPollDelayMs(7)).toBe(3000);
    expect(nextPollDelayMs(10)).toBe(4000);
    expect(nextPollDelayMs(500)).toBe(4000);
  });

  it('explains each failure in French', () => {
    expect(
      describeExtractionFailure({ kind: 'http', status: 429 }, 'start'),
    ).toBe(
      'Une lecture est déjà en cours ou vous en avez fait trop cette heure. Patientez un peu, puis réessayez.',
    );
    expect(
      describeExtractionFailure({ kind: 'http', status: 503 }, 'start'),
    ).toContain('pas disponible');
    expect(
      describeExtractionFailure(
        { kind: 'http', status: 400 },
        'start',
        5 * 1024 * 1024,
      ),
    ).toContain('moins de 5 Mo');
    expect(
      describeExtractionFailure({ kind: 'http', status: 404 }, 'poll'),
    ).toContain('n’est plus disponible');
    expect(describeExtractionFailure({ kind: 'network' }, 'poll')).toContain(
      'Pas de connexion',
    );
    expect(
      describeExtractionFailure({ kind: 'http', status: 500 }, 'poll'),
    ).toContain('a échoué');
  });
});
