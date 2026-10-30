import { Account } from '../domain/account';
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
