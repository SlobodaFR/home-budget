import { describe, expect, it } from 'vitest';
import { account } from '../test/fixtures';
import {
  accountName,
  accountToForm,
  accountToPayload,
  activeAccounts,
  archivedAccounts,
  buildAccountPayload,
  describeDeleteError,
  describeProjection,
  describeTransactionCount,
  DELETE_REFUSED_MESSAGE,
  emptyAccountForm,
  goesNegative,
  resolveDefaultAccount,
  selectableAccounts,
} from './account';

const NOW = new Date(2026, 10, 12, 9, 0, 0);

const values = (overrides: Partial<ReturnType<typeof emptyAccountForm>> = {}) => ({
  ...emptyAccountForm(NOW),
  name: ' Compte commun ',
  openingBalance: '1 200,50',
  ...overrides,
});

describe('buildAccountPayload', () => {
  it('builds the payload with a trimmed name and cents', () => {
    expect(buildAccountPayload(values())).toEqual({
      ok: true,
      payload: { name: 'Compte commun', kind: 'CHECKING', openingBalanceCents: 120050, openingDate: '2026-11-12' },
    });
  });

  it('accepts an overdraft with a minus sign, including the typographic one', () => {
    for (const openingBalance of ['-150', '− 150', '–150']) {
      const result = buildAccountPayload(values({ openingBalance }));
      expect(result.ok && result.payload.openingBalanceCents).toBe(-15000);
    }
  });

  it('treats an empty balance as zero', () => {
    const result = buildAccountPayload(values({ openingBalance: '  ' }));
    expect(result.ok && result.payload.openingBalanceCents).toBe(0);
  });

  it('rejects an unreadable balance', () => {
    for (const openingBalance of ['abc', '12,345', '--5', '1 000 euros']) {
      expect(buildAccountPayload(values({ openingBalance }))).toMatchObject({ ok: false, errors: { openingBalance: expect.any(String) } });
    }
  });

  it('requires a name of 1 to 60 characters', () => {
    expect(buildAccountPayload(values({ name: '   ' }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(buildAccountPayload(values({ name: 'x'.repeat(61) }))).toMatchObject({ ok: false, errors: { name: expect.stringContaining('60') } });
    expect(buildAccountPayload(values({ name: 'x'.repeat(60) })).ok).toBe(true);
  });

  it('refuses a name already used in the space, ignoring case and accents', () => {
    const existing = [{ id: 'a1', name: 'Épargne Enfants' }];
    expect(buildAccountPayload(values({ name: 'epargne enfants' }), existing)).toMatchObject({
      ok: false,
      errors: { name: expect.stringContaining('déjà ce nom') },
    });
  });

  it('lets an account keep its own name when editing', () => {
    const existing = [{ id: 'a1', name: 'Compte commun' }];
    expect(buildAccountPayload(values(), existing, 'a1').ok).toBe(true);
  });

  it('requires a valid opening date', () => {
    expect(buildAccountPayload(values({ openingDate: '' }))).toMatchObject({ ok: false, errors: { openingDate: expect.any(String) } });
    expect(buildAccountPayload(values({ openingDate: '2026-02-30' }))).toMatchObject({ ok: false });
  });

  it('reports every error at once', () => {
    const result = buildAccountPayload(values({ name: '', openingBalance: 'x', openingDate: '' }));
    expect(result.ok === false && Object.keys(result.errors).sort()).toEqual(['name', 'openingBalance', 'openingDate']);
  });
});

describe('form and payload conversions', () => {
  it('fills the form from an account, with the overdraft sign', () => {
    expect(accountToForm(account({ openingBalanceCents: -15050, kind: 'SAVINGS' }))).toEqual({
      name: 'Compte commun',
      kind: 'SAVINGS',
      openingBalance: '-150,50',
      openingDate: '2026-10-01',
    });
  });

  it('round-trips an account through the form', () => {
    const original = account({ openingBalanceCents: -15050 });
    const result = buildAccountPayload(accountToForm(original));
    expect(result).toMatchObject({ ok: true, payload: { openingBalanceCents: -15050, openingDate: '2026-10-01' } });
  });

  it('builds a full update payload and overrides the archive flag', () => {
    expect(accountToPayload(account(), { archived: true })).toEqual({
      name: 'Compte commun',
      kind: 'CHECKING',
      openingBalanceCents: 120000,
      openingDate: '2026-10-01',
      archived: true,
    });
  });
});

describe('account lists', () => {
  const accounts = [account({ id: 'a1' }), account({ id: 'a2', name: 'Livret', archived: true }), account({ id: 'a3', name: 'Cash' })];

  it('splits active and archived accounts', () => {
    expect(activeAccounts(accounts).map((item) => item.id)).toEqual(['a1', 'a3']);
    expect(archivedAccounts(accounts).map((item) => item.id)).toEqual(['a2']);
  });

  it('proposes non archived accounts, plus the current one even when archived', () => {
    expect(selectableAccounts(accounts).map((item) => item.id)).toEqual(['a1', 'a3']);
    expect(selectableAccounts(accounts, 'a2').map((item) => item.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('only remembers a default account that still exists and is not archived', () => {
    expect(resolveDefaultAccount(accounts, 'a3')).toBe('a3');
    expect(resolveDefaultAccount(accounts, 'a2')).toBeNull();
    expect(resolveDefaultAccount(accounts, 'gone')).toBeNull();
    expect(resolveDefaultAccount(accounts, null)).toBeNull();
    expect(resolveDefaultAccount([], 'a1')).toBeNull();
  });

  it('finds an account name', () => {
    expect(accountName(accounts, 'a3')).toBe('Cash');
    expect(accountName(accounts, 'x')).toBeNull();
    expect(accountName(accounts, null)).toBeNull();
    expect(accountName(accounts, undefined)).toBeNull();
  });
});

describe('projection', () => {
  it('says nothing for a healthy account', () => {
    expect(describeProjection(account())).toBeNull();
    expect(goesNegative(account())).toBe(false);
  });

  it('warns when the account would go below zero before the end of the month', () => {
    const risky = account({ balanceCents: 8000, projectedMonthEndCents: -4500 });
    expect(goesNegative(risky)).toBe(true);
    expect(describeProjection(risky)).toMatch(/passerait sous zéro avant la fin du mois \(-45,00\s€\)/);
  });

  it('words it differently when the account is already overdrawn', () => {
    expect(describeProjection(account({ balanceCents: -1000, projectedMonthEndCents: -5000 }))).toMatch(/déjà à découvert/);
  });

  it('does not warn for an archived account', () => {
    expect(describeProjection(account({ archived: true, projectedMonthEndCents: -4500 }))).toBeNull();
  });
});

describe('wording', () => {
  it('counts operations', () => {
    expect(describeTransactionCount(0)).toBe('Aucune opération');
    expect(describeTransactionCount(1)).toBe('1 opération');
    expect(describeTransactionCount(37)).toBe('37 opérations');
  });

  it('suggests archiving when the deletion is refused', () => {
    expect(describeDeleteError(400)).toBe(DELETE_REFUSED_MESSAGE);
    expect(DELETE_REFUSED_MESSAGE).toMatch(/archivez-le/);
    expect(describeDeleteError(500)).toMatch(/réessayez/);
    expect(describeDeleteError(null)).toMatch(/réessayez/);
  });
});
