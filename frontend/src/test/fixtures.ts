import { Account } from '../domain/account';
import { Project } from '../domain/project';
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
