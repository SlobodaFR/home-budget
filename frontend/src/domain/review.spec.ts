import { describe, expect, it } from 'vitest';
import {
  answersEqual,
  blocVerdict,
  buildReviewPayload,
  clampReviewMonth,
  DECISION_REQUIRED_MESSAGE,
  defaultReviewMonth,
  describeBalance,
  describeCompletedOn,
  describeCompletion,
  describeCounter,
  describeExpenseCount,
  describeMissingRecurring,
  describeSavingsRate,
  describeSavingsRateNote,
  describeUnassigned,
  EMPTY_ANSWERS,
  isBlankAnswers,
  isEmptyMonth,
  isFutureMonth,
  isOngoingMonth,
  MAX_REVIEW_ANSWER_LENGTH,
  parseReview,
  parseReviewHistory,
  parseSnapshot,
  remainingCharacters,
  ReviewBlocFigure,
  reviewToForm,
  tooLongMessage,
} from './review';

/** Les montants formatés contiennent des espaces insécables : on les ramène à des espaces simples. */
const plain = (value: string | undefined) => (value ?? '').replace(/[\s\u00a0\u202f]/g, ' ');

const figure = (overrides: Partial<ReviewBlocFigure> = {}): ReviewBlocFigure => ({ bloc: 'COURANT', plannedCents: 100000, actualCents: 80000, deltaCents: -20000, ...overrides });

const rawReview = {
  month: '2026-10',
  status: 'DRAFT',
  answers: { wentWell: 'Les courses', surprise: '', decision: 'Liste de courses' },
  completedAt: null,
  snapshot: {
    incomeCents: 380000,
    expenseCents: 351000,
    balanceCents: 29000,
    savingsRatePercent: 8,
    blocs: [
      { bloc: 'FIXE', plannedCents: 175000, actualCents: 171000, deltaCents: -4000 },
      { bloc: 'COURANT', plannedCents: 100000, actualCents: 120000, deltaCents: 20000 },
      { bloc: 'PLAISIR', plannedCents: 40000, actualCents: 30000, deltaCents: -10000 },
      { bloc: 'EPARGNE', plannedCents: 50000, actualCents: 30000, deltaCents: -20000 },
    ],
    topExpenses: [{ label: 'Courses', amountCents: 142300, count: 9 }],
    missingRecurring: [{ label: 'Assurance', amountCents: 5000 }],
    unassignedTransactionCount: 3,
  },
};

describe('parseReview', () => {
  it('reads a complete review', () => {
    const review = parseReview(rawReview, '2026-09');
    expect(review).toMatchObject({ month: '2026-10', status: 'DRAFT', completedAt: null });
    expect(review?.answers).toEqual({ wentWell: 'Les courses', surprise: '', decision: 'Liste de courses' });
    expect(review?.snapshot.blocs.map((bloc) => bloc.bloc)).toEqual(['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE']);
    expect(review?.snapshot.topExpenses).toEqual([{ label: 'Courses', amountCents: 142300, count: 9 }]);
    expect(review?.snapshot.missingRecurring).toEqual([{ label: 'Assurance', amountCents: 5000 }]);
    expect(review?.snapshot.unassignedTransactionCount).toBe(3);
  });

  it('tolerates a nearly empty answer: zeros, four blocs, month taken from the request', () => {
    const review = parseReview({}, '2026-09');
    expect(review).toMatchObject({ month: '2026-09', status: 'TODO', completedAt: null, answers: EMPTY_ANSWERS });
    expect(review?.snapshot).toMatchObject({ incomeCents: 0, expenseCents: 0, balanceCents: 0, savingsRatePercent: 0, topExpenses: [], missingRecurring: [], unassignedTransactionCount: 0 });
    expect(review?.snapshot.blocs).toHaveLength(4);
    expect(review?.snapshot.blocs.every((bloc) => bloc.plannedCents === 0 && bloc.actualCents === 0 && bloc.deltaCents === 0)).toBe(true);
  });

  it('rejects something that is not an object', () => {
    expect(parseReview(null, '2026-09')).toBeNull();
    expect(parseReview('oops', '2026-09')).toBeNull();
    expect(parseReview([], '2026-09')).toBeNull();
  });

  it('deduces the status when the server forgets it', () => {
    expect(parseReview({ answers: { decision: 'x' } }, '2026-10')?.status).toBe('DRAFT');
    expect(parseReview({ answers: {}, completedAt: '2026-11-03T10:00:00.000Z' }, '2026-10')?.status).toBe('DONE');
    expect(parseReview({ status: 'nope' }, '2026-10')?.status).toBe('TODO');
  });

  it('recomputes what is missing from the snapshot instead of assuming it', () => {
    const snapshot = parseSnapshot({ incomeCents: 200000, expenseCents: 150000, blocs: [{ bloc: 'FIXE', plannedCents: 1000, actualCents: 1500 }] });
    expect(snapshot.balanceCents).toBe(50000);
    expect(snapshot.savingsRatePercent).toBe(25);
    expect(snapshot.blocs[0]).toEqual({ bloc: 'FIXE', plannedCents: 1000, actualCents: 1500, deltaCents: 500 });
  });

  it('ignores unknown or duplicated blocs and broken lines, keeps the five biggest expenses in descending order', () => {
    const snapshot = parseSnapshot({
      blocs: [{ bloc: 'AUTRE', plannedCents: 5 }, { bloc: 'FIXE', plannedCents: 100 }, { bloc: 'FIXE', plannedCents: 999 }, null],
      topExpenses: [
        { label: 'a', amountCents: 100, count: 1 },
        { label: 'b', amountCents: 600, count: 2 },
        { label: 'c', amountCents: 300 },
        { label: 'd', amountCents: 500, count: 1 },
        { label: 'e', amountCents: 200, count: 1 },
        { label: 'f', amountCents: 400, count: 1 },
        { label: 'g' },
        { amountCents: 5 },
      ],
      missingRecurring: [{ label: 'Loyer', amountCents: 80000 }, { amountCents: 5 }],
    });
    expect(snapshot.blocs.find((bloc) => bloc.bloc === 'FIXE')?.plannedCents).toBe(100);
    expect(snapshot.blocs).toHaveLength(4);
    expect(snapshot.topExpenses.map((expense) => expense.label)).toEqual(['b', 'd', 'f', 'c', 'e']);
    expect(snapshot.topExpenses[3].count).toBe(1);
    expect(snapshot.missingRecurring).toEqual([{ label: 'Loyer', amountCents: 80000 }]);
  });

  it('keeps a negative savings rate', () => {
    expect(parseSnapshot({ incomeCents: 100000, expenseCents: 120000, savingsRatePercent: -20 }).savingsRatePercent).toBe(-20);
  });
});

describe('parseReviewHistory', () => {
  it('keeps started reviews only, newest first, whatever the server order', () => {
    const items = parseReviewHistory([
      { month: '2026-08', status: 'DONE', decision: 'A', completedAt: '2026-09-02T10:00:00.000Z' },
      { month: '2026-10', status: 'DRAFT', decision: '' },
      { month: '2026-09', status: 'TODO', decision: '' },
      { month: 'pas-un-mois', status: 'DONE' },
      { month: '2026-07', completedAt: '2026-08-01T00:00:00.000Z' },
      { month: '2026-06' },
      null,
    ]);
    expect(items.map((item) => [item.month, item.status])).toEqual([
      ['2026-10', 'DRAFT'],
      ['2026-08', 'DONE'],
      ['2026-07', 'DONE'],
    ]);
    expect(items[1]).toEqual({ month: '2026-08', status: 'DONE', decision: 'A', completedAt: '2026-09-02T10:00:00.000Z' });
  });

  it('returns an empty list for anything that is not a list', () => {
    expect(parseReviewHistory(null)).toEqual([]);
    expect(parseReviewHistory({ reviews: [] })).toEqual([]);
  });
});

describe('default month', () => {
  const day = (d: number) => new Date(2026, 10, d, 12, 0, 0);

  it('proposes the previous month during the first seven days when its review is not done', () => {
    expect(defaultReviewMonth(day(1), [])).toBe('2026-10');
    expect(defaultReviewMonth(day(7), [{ month: '2026-10', status: 'DRAFT' }])).toBe('2026-10');
  });

  it('proposes the current month once the previous review is done', () => {
    expect(defaultReviewMonth(day(3), [{ month: '2026-10', status: 'DONE' }])).toBe('2026-11');
  });

  it('proposes the current month from the 8th on, done or not', () => {
    expect(defaultReviewMonth(day(8), [])).toBe('2026-11');
    expect(defaultReviewMonth(day(30), [{ month: '2026-10', status: 'DRAFT' }])).toBe('2026-11');
  });

  it('is not fooled by another month being done', () => {
    expect(defaultReviewMonth(day(2), [{ month: '2026-09', status: 'DONE' }])).toBe('2026-10');
  });

  it('crosses the year boundary', () => {
    expect(defaultReviewMonth(new Date(2027, 0, 2), [])).toBe('2026-12');
  });

  it('never proposes a future month', () => {
    const now = day(15);
    expect(isFutureMonth('2026-12', now)).toBe(true);
    expect(isFutureMonth('2026-11', now)).toBe(false);
    expect(clampReviewMonth('2027-01', now)).toBe('2026-11');
    expect(clampReviewMonth('2026-09', now)).toBe('2026-09');
    expect(isOngoingMonth('2026-11', now)).toBe(true);
    expect(isOngoingMonth('2026-10', now)).toBe(false);
  });
});

describe('blocVerdict', () => {
  it('reads a spending bloc: overrun is a warning, under plan is good, with the amount in words', () => {
    expect(blocVerdict(figure({ deltaCents: 4000, actualCents: 104000 }))).toMatchObject({ tone: 'warn', label: 'Dépassement' });
    expect(plain(blocVerdict(figure({ deltaCents: 4000 })).text)).toBe('Dépassement de 40 € par rapport au prévu.');
    expect(blocVerdict(figure())).toMatchObject({ tone: 'good', label: 'Sous le prévu' });
    expect(plain(blocVerdict(figure()).text)).toBe('200 € de moins que prévu.');
    expect(blocVerdict(figure({ actualCents: 100000, deltaCents: 0 }))).toMatchObject({ tone: 'good', label: 'Pile dans le prévu' });
  });

  it('reads the savings bloc the other way round', () => {
    const savings = (deltaCents: number) => blocVerdict(figure({ bloc: 'EPARGNE', plannedCents: 50000, actualCents: 50000 + deltaCents, deltaCents }));
    expect(savings(-20000)).toMatchObject({ tone: 'warn', label: 'En dessous du prévu' });
    expect(plain(savings(-20000).text)).toBe('Il manque 200 € par rapport à l’épargne prévue.');
    expect(savings(0)).toMatchObject({ tone: 'good', label: 'Objectif atteint' });
    expect(savings(5000)).toMatchObject({ tone: 'good', label: 'Objectif dépassé' });
    expect(plain(savings(5000).text)).toBe('Vous avez mis de côté 50 € de plus que prévu.');
  });

  it('stays neutral when nothing is planned nor spent', () => {
    expect(blocVerdict(figure({ plannedCents: 0, actualCents: 0, deltaCents: 0 }))).toMatchObject({ tone: 'neutral', label: 'Rien de prévu' });
  });

  it('always writes a label and a sentence, never colour alone', () => {
    for (const delta of [-5000, 0, 5000]) {
      for (const bloc of ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'] as const) {
        const verdict = blocVerdict(figure({ bloc, deltaCents: delta, actualCents: 100000 + delta }));
        expect(verdict.label.length).toBeGreaterThan(0);
        expect(verdict.text.endsWith('.')).toBe(true);
      }
    }
  });
});

describe('wording', () => {
  it('describes the savings rate, a negative one and the absence of income', () => {
    expect(describeSavingsRate({ incomeCents: 380000, savingsRatePercent: 8 })).toBe('8 %');
    expect(describeSavingsRate({ incomeCents: 100000, savingsRatePercent: -20 })).toBe('-20 %');
    expect(describeSavingsRate({ incomeCents: 0, savingsRatePercent: 0 })).toBe('—');
    expect(describeSavingsRateNote({ incomeCents: 0, savingsRatePercent: 0 })).toBe('Aucun revenu ce mois-ci : pas de taux à calculer.');
    expect(describeSavingsRateNote({ incomeCents: 100000, savingsRatePercent: -20 })).toBe('Vous avez dépensé plus que vos revenus.');
    expect(describeSavingsRateNote({ incomeCents: 100000, savingsRatePercent: 10 })).toBe('de vos revenus mis de côté');
  });

  it('describes the balance in a sentence', () => {
    expect(plain(describeBalance(29000))).toBe('Il vous est resté 290 € après toutes les dépenses.');
    expect(plain(describeBalance(-12050))).toBe('Vous avez dépensé 120,50 € de plus que vos revenus.');
    expect(describeBalance(0)).toBe('Revenus et dépenses sont à l’équilibre.');
  });

  it('pluralises counts', () => {
    expect(describeExpenseCount(1)).toBe('1 opération');
    expect(describeExpenseCount(9)).toBe('9 opérations');
    expect(describeMissingRecurring([{ label: 'a', amountCents: 1 }])).toBe('1 paiement récurrent introuvable');
    expect(describeMissingRecurring([{ label: 'a', amountCents: 1 }, { label: 'b', amountCents: 2 }])).toBe('2 paiements récurrents introuvables');
    expect(describeUnassigned(1)).toBe('1 opération n’est rattachée à aucun compte.');
    expect(describeUnassigned(4)).toBe('4 opérations ne sont rattachées à aucun compte.');
  });

  it('spots an empty month', () => {
    expect(isEmptyMonth(parseSnapshot({}))).toBe(true);
    expect(isEmptyMonth(parseSnapshot({ incomeCents: 1 }))).toBe(false);
  });

  it('writes the completion date in French', () => {
    expect(describeCompletion('2026-11-03T10:00:00.000Z')).toBe('Revue terminée le 3 novembre 2026');
    expect(describeCompletedOn('2026-11-03T10:00:00.000Z')).toBe('Terminée le 3 novembre 2026');
  });
});

describe('answers form', () => {
  it('counts characters against the 500 limit', () => {
    expect(describeCounter('')).toBe('0 / 500');
    expect(describeCounter('a'.repeat(120))).toBe('120 / 500');
    expect(remainingCharacters('a'.repeat(120))).toBe(380);
    expect(remainingCharacters('a'.repeat(MAX_REVIEW_ANSWER_LENGTH))).toBe(0);
  });

  it('accepts a partial or empty draft', () => {
    expect(buildReviewPayload(EMPTY_ANSWERS, false)).toEqual({ ok: true, payload: { answers: EMPTY_ANSWERS, complete: false } });
    expect(buildReviewPayload({ wentWell: ' Bien ', surprise: '', decision: '' }, false)).toEqual({
      ok: true,
      payload: { answers: { wentWell: 'Bien', surprise: '', decision: '' }, complete: false },
    });
  });

  it('requires a decision to finish, with a clear message', () => {
    expect(buildReviewPayload({ wentWell: 'x', surprise: 'y', decision: '' }, true)).toEqual({ ok: false, errors: { decision: DECISION_REQUIRED_MESSAGE } });
    expect(buildReviewPayload({ wentWell: '', surprise: '', decision: '   ' }, true)).toEqual({ ok: false, errors: { decision: DECISION_REQUIRED_MESSAGE } });
    expect(buildReviewPayload({ wentWell: '', surprise: '', decision: 'Faire une liste' }, true)).toEqual({
      ok: true,
      payload: { answers: { wentWell: '', surprise: '', decision: 'Faire une liste' }, complete: true },
    });
  });

  it('refuses an answer over 500 characters, even for a draft', () => {
    const long = 'a'.repeat(MAX_REVIEW_ANSWER_LENGTH + 1);
    expect(buildReviewPayload({ wentWell: long, surprise: '', decision: 'ok' }, false)).toEqual({ ok: false, errors: { wentWell: tooLongMessage() } });
    expect(buildReviewPayload({ wentWell: '', surprise: '', decision: long }, true)).toEqual({ ok: false, errors: { decision: tooLongMessage() } });
    expect(buildReviewPayload({ wentWell: 'a'.repeat(500), surprise: '', decision: 'ok' }, true).ok).toBe(true);
  });

  it('copies the answers for the form and compares them', () => {
    const review = parseReview(rawReview, '2026-10') as NonNullable<ReturnType<typeof parseReview>>;
    const form = reviewToForm(review);
    expect(form).toEqual(review.answers);
    expect(form).not.toBe(review.answers);
    expect(answersEqual(form, review.answers)).toBe(true);
    expect(answersEqual({ ...form, surprise: 'x' }, review.answers)).toBe(false);
    expect(isBlankAnswers(EMPTY_ANSWERS)).toBe(true);
    expect(isBlankAnswers({ ...EMPTY_ANSWERS, surprise: ' ' })).toBe(true);
    expect(isBlankAnswers(form)).toBe(false);
  });
});
