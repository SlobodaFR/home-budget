import { rec, tx } from '../../testing/builders';
import { buildForecast } from '../budget/forecast';
import { summarizeMonth } from '../budget/month-summary';
import { DomainError } from '../shared/domain-error';
import { Money } from '../shared/money';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';
import { MonthReview, ReviewAnswers } from './month-review';
import { buildReviewSnapshot } from './review-snapshot';

const NOW = new Date('2026-11-12T09:00:00Z');
const answers = (over: Partial<ReviewAnswers> = {}): ReviewAnswers => ({
  wentWell: '',
  surprise: '',
  decision: '',
  ...over,
});
const save = (
  existing: MonthReview | null,
  a: ReviewAnswers,
  complete: boolean,
  now = NOW,
) => MonthReview.save('common', '2026-10', existing, a, complete, now);

describe('MonthReview', () => {
  it('derives the status: TODO, DRAFT, DONE', () => {
    const draft = save(null, answers({ surprise: 'Les courses' }), false)!;
    expect(draft.status).toBe('DRAFT');
    expect(draft.completedAt).toBeNull();
    const done = save(
      null,
      answers({ wentWell: 'Épargne tenue', decision: 'Cuisiner plus' }),
      true,
    )!;
    expect(done.status).toBe('DONE');
    expect(done.completedAt).toEqual(NOW);
    expect(save(null, answers(), false)).toBeNull(); // TODO : rien à stocker
  });

  it('requires a non-empty decision to complete (whitespace does not count)', () => {
    expect(() => save(null, answers({ wentWell: 'Bien' }), true)).toThrow(
      DomainError,
    );
    expect(() => save(null, answers({ decision: '   ' }), true)).toThrow(
      /décision/,
    );
    expect(() => save(null, answers({ decision: 'x' }), true)).not.toThrow();
    // Un brouillon peut très bien ne pas avoir de décision.
    expect(() =>
      save(null, answers({ wentWell: 'Bien' }), false),
    ).not.toThrow();
  });

  it('limits every answer to 500 characters', () => {
    const ok = 'x'.repeat(500);
    expect(() => save(null, answers({ wentWell: ok }), false)).not.toThrow();
    for (const key of ['wentWell', 'surprise', 'decision'] as const) {
      expect(() =>
        save(null, answers({ [key]: 'x'.repeat(501) }), false),
      ).toThrow(DomainError);
    }
    expect(() => save(null, answers({ decision: ok }), true)).not.toThrow();
  });

  it('keeps completedAt when an already completed review is saved again', () => {
    const first = save(null, answers({ decision: 'A' }), true)!;
    const later = new Date('2026-11-20T09:00:00Z');
    const again = save(
      first,
      answers({ decision: 'B', surprise: 'x' }),
      true,
      later,
    )!;
    expect(again.completedAt).toEqual(NOW);
    expect(again.answers.decision).toBe('B');
    expect(again.status).toBe('DONE');
  });

  it('reopens a completed review as a draft, or as TODO when everything is erased', () => {
    const done = save(null, answers({ decision: 'A' }), true)!;
    const reopened = save(done, answers({ decision: 'A' }), false)!;
    expect(reopened.status).toBe('DRAFT');
    expect(reopened.completedAt).toBeNull();
    expect(save(done, answers(), false)).toBeNull();
  });

  it('trims the answers and validates the month', () => {
    expect(
      save(null, answers({ decision: '  Cuisiner  ' }), false)!.answers
        .decision,
    ).toBe('Cuisiner');
    for (const month of ['2026-13', '2026-1', 'octobre', '']) {
      expect(() =>
        MonthReview.save(
          'common',
          month,
          null,
          answers({ decision: 'x' }),
          false,
          NOW,
        ),
      ).toThrow(DomainError);
    }
  });
});

const PLAN = SpacePlan.create({
  incomeCents: 380000,
  fixeCents: 175000,
  courantCents: 100000,
  plaisirCents: 45000,
  epargneCents: 20000,
});

function snapshotOf(
  transactions: Transaction[],
  over: {
    plan?: SpacePlan;
    recurring?: ReturnType<typeof rec>[];
    accountCount?: number;
    month?: string;
  } = {},
) {
  const month = over.month ?? '2026-10';
  const plan = over.plan ?? PLAN;
  return buildReviewSnapshot({
    summary: summarizeMonth(month, plan, transactions),
    forecast: buildForecast({
      month,
      today: NOW,
      plan,
      transactions,
      recurring: over.recurring ?? [],
    }),
    transactions,
    accountCount: over.accountCount ?? 0,
  });
}

const withAccount = (t: Transaction, accountId: string | null) =>
  Transaction.create({
    id: t.id,
    spaceId: t.spaceId,
    kind: t.kind,
    bloc: t.bloc,
    label: t.label,
    amount: Money.fromCents(t.amount.toCents()),
    date: t.date,
    accountId,
  });

describe('buildReviewSnapshot', () => {
  const october = [
    tx('INCOME', null, 'Salaire', 380000, '2026-10-28'),
    tx('EXPENSE', 'FIXE', 'PRLV LOYER', 110000, '2026-10-05'),
    tx('EXPENSE', 'FIXE', 'EDF', 61000, '2026-10-10'),
    tx('EXPENSE', 'COURANT', 'Courses', 50000, '2026-10-03'),
    tx('EXPENSE', 'COURANT', 'COURSES', 60000, '2026-10-12'),
    tx('EXPENSE', 'COURANT', 'Courses', 32300, '2026-10-20'),
    tx('EXPENSE', 'PLAISIR', 'Café Étoilé', 3000, '2026-10-06'),
    tx('EXPENSE', 'PLAISIR', 'CAFE ETOILE', 2000, '2026-10-07'),
    tx('EXPENSE', 'EPARGNE', 'Livret', 30000, '2026-10-29'),
    tx('EXPENSE', 'COURANT', 'Boulangerie', 1000, '2026-10-08'),
  ];

  it('totals the month, with deltas as actual minus planned', () => {
    const snapshot = snapshotOf(october);
    expect(snapshot.incomeCents).toBe(380000);
    // 171 000 + 143 300 + 5 000 + 30 000
    expect(snapshot.expenseCents).toBe(349300);
    expect(snapshot.balanceCents).toBe(30700);
    expect(snapshot.savingsRatePercent).toBe(8); // 8,08
    expect(snapshot.blocs).toEqual([
      {
        bloc: 'FIXE',
        plannedCents: 175000,
        actualCents: 171000,
        deltaCents: -4000,
      },
      {
        bloc: 'COURANT',
        plannedCents: 100000,
        actualCents: 143300,
        deltaCents: 43300,
      },
      {
        bloc: 'PLAISIR',
        plannedCents: 45000,
        actualCents: 5000,
        deltaCents: -40000,
      },
      {
        bloc: 'EPARGNE',
        plannedCents: 20000,
        actualCents: 30000,
        deltaCents: 10000,
      },
    ]);
  });

  it('groups the labels without case or accents, sums them and keeps the five biggest', () => {
    const { topExpenses } = snapshotOf(october);
    expect(topExpenses).toEqual([
      // Libellé de la plus grosse opération du groupe.
      { label: 'COURSES', amountCents: 142300, count: 3 },
      { label: 'PRLV LOYER', amountCents: 110000, count: 1 },
      { label: 'EDF', amountCents: 61000, count: 1 },
      { label: 'Livret', amountCents: 30000, count: 1 },
      { label: 'Café Étoilé', amountCents: 5000, count: 2 },
    ]);
    // La boulangerie (1 000) est sixième : coupée. Les revenus ne comptent pas.
    expect(topExpenses.map((e) => e.label)).not.toContain('Boulangerie');
    expect(topExpenses.map((e) => e.label)).not.toContain('Salaire');
  });

  it('breaks ties on the biggest operation by the oldest one, and amounts by label', () => {
    const { topExpenses } = snapshotOf([
      tx('EXPENSE', 'COURANT', 'Pain', 500, '2026-10-09'),
      tx('EXPENSE', 'COURANT', 'PAIN', 500, '2026-10-02'),
      tx('EXPENSE', 'COURANT', 'Beurre', 1000, '2026-10-03'),
    ]);
    expect(topExpenses).toEqual([
      { label: 'Beurre', amountCents: 1000, count: 1 },
      { label: 'PAIN', amountCents: 1000, count: 2 },
    ]);
  });

  it('rounds the savings rate to the nearest integer, half away from zero, without -0', () => {
    const rate = (income: number, expense: number) =>
      snapshotOf([
        ...(income > 0
          ? [tx('INCOME', null, 'Salaire', income, '2026-10-02')]
          : []),
        tx('EXPENSE', 'COURANT', 'Courses', expense, '2026-10-03'),
      ]).savingsRatePercent;
    expect(rate(380000, 350000)).toBe(8); // 30 000 / 380 000 = 7,89
    expect(rate(380000, 351000)).toBe(8); // 29 000 / 380 000 = 7,63
    expect(rate(200000, 199000)).toBe(1); // 0,5 -> 1
    expect(rate(200000, 199001)).toBe(0); // 0,4995
    expect(rate(300000, 150000)).toBe(50);
    expect(rate(300000, 301000)).toBe(0); // -0,33 -> 0 et non -0
    expect(Object.is(rate(300000, 301000), 0)).toBe(true);
    expect(rate(200000, 201000)).toBe(-1); // -0,5 -> -1
    expect(rate(300000, 350000)).toBe(-17); // -16,67
    expect(rate(0, 50000)).toBe(0); // pas de revenu
    expect(rate(100000, 100000)).toBe(0);
  });

  it('lists the missing recurring payments of the month', () => {
    const snapshot = snapshotOf(october, {
      recurring: [
        rec('EXPENSE', 'FIXE', 'Assurance', 5000, { dayOfMonth: 8 }),
        rec('EXPENSE', 'FIXE', 'Loyer', 110000, { dayOfMonth: 5 }), // retrouvé
        rec('EXPENSE', 'FIXE', 'Taxe', 90000, {
          frequency: 'YEARLY',
          monthOfYear: 3,
        }), // hors mois
      ],
    });
    expect(snapshot.missingRecurring).toEqual([
      { label: 'Assurance', amountCents: 5000 },
    ]);
  });

  it('counts unassigned operations only when the space has accounts', () => {
    const list = [
      withAccount(tx('EXPENSE', 'COURANT', 'a', 100, '2026-10-03'), 'acc'),
      tx('EXPENSE', 'COURANT', 'b', 100, '2026-10-04'),
      tx('INCOME', null, 'c', 100, '2026-10-05'),
    ];
    expect(
      snapshotOf(list, { accountCount: 1 }).unassignedTransactionCount,
    ).toBe(2);
    expect(
      snapshotOf(list, { accountCount: 0 }).unassignedTransactionCount,
    ).toBe(0);
    expect(
      snapshotOf(list.slice(0, 1), { accountCount: 1 })
        .unassignedTransactionCount,
    ).toBe(0);
  });

  it('handles a month without plan or operations', () => {
    const snapshot = snapshotOf([], { plan: SpacePlan.empty() });
    expect(snapshot).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      balanceCents: 0,
      savingsRatePercent: 0,
      blocs: ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'].map((bloc) => ({
        bloc,
        plannedCents: 0,
        actualCents: 0,
        deltaCents: 0,
      })),
      topExpenses: [],
      missingRecurring: [],
      unassignedTransactionCount: 0,
    });
  });
});
