import { Occurrence } from '../budget/forecast';
import { DomainError } from '../shared/domain-error';
import { tx } from '../../testing/builders';
import { Transaction } from '../transaction/transaction';
import { Money } from '../shared/money';
import { Account, AccountProps, assertAccountUsable } from './account';
import { buildAccountViews } from './account-balance';

const base: AccountProps = {
  id: 'a1',
  spaceId: 'common',
  name: '  Compte commun ',
  kind: 'CHECKING',
  openingBalanceCents: 120000,
  openingDate: '2026-10-01',
  archived: false,
};
const make = (over: Partial<AccountProps> = {}) =>
  Account.create({ ...base, ...over });

describe('Account', () => {
  it('trims the name and exposes its fields', () => {
    const account = make();
    expect(account.name).toBe('Compte commun');
    expect(account.openingBalanceCents).toBe(120000);
  });

  it('accepts a negative opening balance (overdraft) and the name boundaries', () => {
    expect(() => make({ openingBalanceCents: -5000 })).not.toThrow();
    expect(() => make({ openingBalanceCents: 0 })).not.toThrow();
    expect(() => make({ name: 'x' })).not.toThrow();
    expect(() => make({ name: 'x'.repeat(60) })).not.toThrow();
    for (const kind of ['CHECKING', 'SAVINGS', 'CASH'] as const) {
      expect(() => make({ kind })).not.toThrow();
    }
  });

  it.each([
    ['empty name', { name: '   ' }],
    ['name of 61 characters', { name: 'x'.repeat(61) }],
    ['unknown kind', { kind: 'CRYPTO' as never }],
    ['fractional balance', { openingBalanceCents: 10.5 }],
    ['absurd balance', { openingBalanceCents: 1e15 }],
    ['impossible opening date', { openingDate: '2026-02-30' }],
    ['malformed opening date', { openingDate: '01/10/2026' }],
  ])('rejects %s', (_label, over) => {
    expect(() => make(over)).toThrow(DomainError);
  });

  it('compares names without regard to case', () => {
    const account = make({ name: 'Livret A' });
    expect(account.hasSameNameAs('livret a')).toBe(true);
    expect(account.hasSameNameAs('  LIVRET A  ')).toBe(true);
    expect(account.hasSameNameAs('Livret B')).toBe(false);
  });
});

describe('assertAccountUsable', () => {
  it('requires an existing account of the same space, not archived', () => {
    expect(() => assertAccountUsable(make(), 'common')).not.toThrow();
    expect(() => assertAccountUsable(null, 'common')).toThrow(DomainError);
    expect(() => assertAccountUsable(make(), 'perso')).toThrow(
      /n'existe pas dans cet espace/,
    );
    expect(() =>
      assertAccountUsable(make({ archived: true }), 'common'),
    ).toThrow(/archivé/);
  });

  it('lets an existing assignment to an archived account be kept', () => {
    expect(() =>
      assertAccountUsable(make({ archived: true }), 'common', true),
    ).not.toThrow();
    // Mais jamais un compte d'un autre espace, même conservé.
    expect(() => assertAccountUsable(make(), 'perso', true)).toThrow(
      DomainError,
    );
  });
});

function onAccount(
  accountId: string | null,
  kind: 'INCOME' | 'EXPENSE',
  cents: number,
  date: string,
): Transaction {
  const base = tx(
    kind,
    kind === 'EXPENSE' ? 'COURANT' : null,
    'x',
    cents,
    date,
  );
  return Transaction.create({
    id: base.id,
    spaceId: base.spaceId,
    kind: base.kind,
    bloc: base.bloc,
    label: base.label,
    amount: Money.fromCents(cents),
    date: base.date,
    accountId,
  });
}

function occurrence(
  accountId: string | null,
  kind: 'INCOME' | 'EXPENSE',
  cents: number,
  status: Occurrence['status'],
): Occurrence {
  return {
    recurringId: 'r',
    label: 'x',
    kind,
    bloc: kind === 'EXPENSE' ? 'FIXE' : null,
    amountCents: cents,
    date: new Date('2026-11-20T00:00:00Z'),
    estimated: false,
    accountId,
    status,
    matchedTransactionId: null,
    matchedAmountCents: null,
  };
}

describe('buildAccountViews', () => {
  const courant = make({ id: 'c', name: 'Courant' });
  const livret = make({
    id: 'l',
    name: 'Livret',
    kind: 'SAVINGS',
    openingBalanceCents: 500000,
  });
  const vieux = make({ id: 'v', name: 'Ancien', archived: true });

  it('adds incomes and subtracts expenses from the opening balance', () => {
    const [view] = buildAccountViews(
      [courant],
      [
        onAccount('c', 'INCOME', 300000, '2026-11-02'),
        onAccount('c', 'EXPENSE', 110000, '2026-11-05'),
        onAccount('c', 'EXPENSE', 14230, '2026-11-06'),
        onAccount('l', 'INCOME', 999, '2026-11-06'),
      ],
      [],
    );
    // 120 000 + 300 000 - 110 000 - 14 230
    expect(view.balanceCents).toBe(295770);
    expect(view.transactionCount).toBe(3);
    expect(view.projectedMonthEndCents).toBe(295770);
  });

  it('ignores operations before the opening date in the balance but counts them', () => {
    const [view] = buildAccountViews(
      [courant],
      [
        onAccount('c', 'EXPENSE', 50000, '2026-09-30T23:59:00Z'),
        onAccount('c', 'EXPENSE', 1000, '2026-10-01T00:00:00Z'),
      ],
      [],
    );
    expect(view.balanceCents).toBe(119000);
    expect(view.transactionCount).toBe(2);
  });

  it('projects the month end with the DUE and MISSING recurring occurrences of the account', () => {
    const views = buildAccountViews(
      [courant, livret],
      [],
      [
        occurrence('c', 'EXPENSE', 110000, 'DUE'),
        occurrence('c', 'EXPENSE', 4500, 'MISSING'),
        occurrence('c', 'INCOME', 30000, 'DUE'),
        occurrence('c', 'EXPENSE', 99999, 'PAID'),
        occurrence('l', 'EXPENSE', 20000, 'DUE'),
        occurrence(null, 'EXPENSE', 77777, 'DUE'),
      ],
    );
    const byId = Object.fromEntries(views.map((v) => [v.account.id, v]));
    // 120 000 - 110 000 - 4 500 + 30 000
    expect(byId.c.projectedMonthEndCents).toBe(35500);
    expect(byId.c.balanceCents).toBe(120000);
    expect(byId.l.projectedMonthEndCents).toBe(480000);
  });

  it('lists archived accounts last, sorted by name, with a projection equal to the balance', () => {
    const views = buildAccountViews(
      [vieux, livret, courant],
      [],
      [occurrence('v', 'EXPENSE', 5000, 'DUE')],
    );
    expect(views.map((v) => v.account.name)).toEqual([
      'Courant',
      'Livret',
      'Ancien',
    ]);
    expect(views[2].projectedMonthEndCents).toBe(views[2].balanceCents);
  });

  it('handles an account without anything', () => {
    expect(buildAccountViews([], [], [])).toEqual([]);
    const [view] = buildAccountViews([courant], [], []);
    expect(view).toMatchObject({
      balanceCents: 120000,
      projectedMonthEndCents: 120000,
      transactionCount: 0,
    });
  });
});
