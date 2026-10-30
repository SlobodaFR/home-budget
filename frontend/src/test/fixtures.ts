import { Account } from '../domain/account';
import { Project } from '../domain/project';
import { MonthlyReview, ReviewHistoryItem, ReviewSnapshot } from '../domain/review';
import { PreviewRow } from '../domain/statement-import';

export function previewRow(
  index: number,
  overrides: Partial<PreviewRow> & { target?: PreviewRow['suggestion']['target'] } = {},
): PreviewRow {
  const { target = null, ...rest } = overrides;
  return {
    index,
    date: '2026-10-02T00:00:00.000Z',
    label: `LIBELLE ${index}`,
    amountCents: -1000,
    suggestion: { target, rule: target ? 'regle' : null },
    duplicate: false,
    ...rest,
  };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    spaceId: 's-common',
    name: 'Compte commun',
    kind: 'CHECKING',
    openingBalanceCents: 120000,
    openingDate: '2026-10-01',
    archived: false,
    balanceCents: 98450,
    projectedMonthEndCents: 41200,
    transactionCount: 37,
    ...overrides,
  };
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    spaceId: 's-common',
    name: 'Vacances été 2027',
    kind: 'HOLIDAY',
    targetCents: 300000,
    targetDate: '2027-07-01',
    startCents: 0,
    startDate: '2026-11-01',
    savedCents: 40000,
    remainingCents: 260000,
    progressPercent: 13,
    monthsLeft: 8,
    monthlyNeededCents: 32500,
    status: 'BEHIND',
    expectedSavedCents: 75000,
    archived: false,
    accountId: null,
    ...overrides,
  };
}

export function reviewSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    incomeCents: 380000,
    expenseCents: 351000,
    balanceCents: 29000,
    savingsRatePercent: 8,
    blocs: [
      { bloc: 'FIXE', plannedCents: 175000, actualCents: 171000, deltaCents: -4000 },
      { bloc: 'COURANT', plannedCents: 100000, actualCents: 140000, deltaCents: 40000 },
      { bloc: 'PLAISIR', plannedCents: 40000, actualCents: 40000, deltaCents: 0 },
      { bloc: 'EPARGNE', plannedCents: 50000, actualCents: 30000, deltaCents: -20000 },
    ],
    topExpenses: [
      { label: 'Courses', amountCents: 142300, count: 9 },
      { label: 'Loyer', amountCents: 120000, count: 1 },
      { label: 'Essence', amountCents: 21000, count: 3 },
    ],
    missingRecurring: [],
    unassignedTransactionCount: 0,
    ...overrides,
  };
}

export function review(overrides: Partial<MonthlyReview> = {}): MonthlyReview {
  return {
    month: '2026-10',
    status: 'TODO',
    answers: { wentWell: '', surprise: '', decision: '' },
    completedAt: null,
    snapshot: reviewSnapshot(),
    ...overrides,
  };
}

export function reviewHistoryItem(overrides: Partial<ReviewHistoryItem> = {}): ReviewHistoryItem {
  return { month: '2026-09', status: 'DONE', decision: 'Fixer 400 € pour les courses', completedAt: '2026-10-03T08:00:00.000Z', ...overrides };
}
