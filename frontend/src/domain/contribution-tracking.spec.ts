import { describe, expect, it } from 'vitest';
import {
  buildContributionPayload,
  ContributionFormValues,
  deduceStatus,
  describeMemberStatus,
  describePayment,
  describeProgress,
  describeTotals,
  emptyContributionForm,
  maxContributionMonth,
  myContribution,
  needsPayment,
  parseContributionReport,
  parsePaymentResult,
  progressPercent,
} from './contribution-tracking';

const NOW = new Date(2026, 10, 15, 9, 0, 0);

/** Les montants formatés contiennent des espaces insécables : on les ramène à des espaces simples. */
const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const rawReport = {
  month: '2026-11',
  incomplete: false,
  members: [
    { userId: 'alice', name: 'Alice', expectedCents: 175000, paidCents: 120000, remainingCents: 55000, status: 'PARTIAL', isMe: true },
    { userId: 'bob', name: 'Bob', expectedCents: 175000, paidCents: 0, remainingCents: 175000, status: 'PENDING', isMe: false },
  ],
  totalExpectedCents: 350000,
  totalPaidCents: 120000,
};

const validForm = (overrides: Partial<ContributionFormValues> = {}): ContributionFormValues => ({
  amount: '550',
  date: '2026-11-03',
  accountId: '',
  debitPersonal: false,
  personalBloc: 'FIXE',
  personalAccountId: '',
  ...overrides,
});

describe('parseContributionReport', () => {
  it('reads a complete report', () => {
    const report = parseContributionReport(rawReport, '2026-10');
    expect(report).toEqual(rawReport);
    expect(myContribution(report)?.name).toBe('Alice');
  });

  it('tolerates an empty or broken answer', () => {
    for (const value of [null, undefined, 'x', [], {}]) {
      expect(parseContributionReport(value, '2026-10')).toEqual({ month: '2026-10', incomplete: false, members: [], totalExpectedCents: 0, totalPaidCents: 0 });
    }
  });

  it('reads an incomplete report: unknown amounts stay null and the total is null', () => {
    const report = parseContributionReport(
      {
        month: '2026-11',
        incomplete: true,
        members: [{ userId: 'alice', name: 'Alice', expectedCents: null, paidCents: 5000, remainingCents: null, status: 'UNKNOWN', isMe: true }],
        totalExpectedCents: null,
        totalPaidCents: 5000,
      },
      '2026-11',
    );
    expect(report.incomplete).toBe(true);
    expect(report.totalExpectedCents).toBeNull();
    expect(report.members[0]).toMatchObject({ expectedCents: null, remainingCents: null, status: 'UNKNOWN', paidCents: 5000 });
  });

  it('deduces « incomplete » from a member without expected amount, even if the flag is missing', () => {
    const report = parseContributionReport({ members: [{ userId: 'a', name: 'A', paidCents: 0 }] }, '2026-11');
    expect(report.incomplete).toBe(true);
    expect(report.totalExpectedCents).toBeNull();
  });

  it('deduces the status and the remaining amount when the server forgets them', () => {
    const report = parseContributionReport({ members: [{ userId: 'a', name: 'A', expectedCents: 1000, paidCents: 400 }, { userId: 'b', name: 'B', expectedCents: 1000, paidCents: 5000, status: 'MAGIC' }] }, '2026-11');
    expect(report.members[0]).toMatchObject({ status: 'PARTIAL', remainingCents: 600, isMe: false });
    expect(report.members[1]).toMatchObject({ status: 'OVERPAID', remainingCents: 0 });
    expect(report.totalExpectedCents).toBe(2000);
    expect(report.totalPaidCents).toBe(5400);
  });

  it('skips members without id or name and keeps a bad month from breaking the report', () => {
    const report = parseContributionReport({ month: 'nope', members: [null, { name: 'x' }, { userId: 'a', name: 'A', expectedCents: 0, paidCents: 0 }] }, '2026-09');
    expect(report.month).toBe('2026-09');
    expect(report.members).toHaveLength(1);
    expect(report.members[0].status).toBe('NONE');
  });

  it('reads the payment result', () => {
    expect(parsePaymentResult({ transactionId: 't1', personalTransactionId: 't2' })).toEqual({ transactionId: 't1', personalTransactionId: 't2' });
    expect(parsePaymentResult({ transactionId: 't1', personalTransactionId: null })).toEqual({ transactionId: 't1', personalTransactionId: null });
    expect(parsePaymentResult(null)).toEqual({ transactionId: '', personalTransactionId: null });
  });
});

describe('deduceStatus', () => {
  it.each([
    [null, 0, 'UNKNOWN'],
    [0, 0, 'NONE'],
    [100000, 0, 'PENDING'],
    [100000, 40000, 'PARTIAL'],
    [100000, 100000, 'PAID'],
    [100000, 100100, 'PAID'],
    [100000, 100101, 'OVERPAID'],
  ] as const)('expected %s, paid %s → %s', (expected, paid, status) => {
    expect(deduceStatus(expected, paid)).toBe(status);
  });
});

describe('wording', () => {
  it('writes where each member stands, in words', () => {
    expect(plain(describeMemberStatus({ status: 'PARTIAL', expectedCents: 175000, paidCents: 120000, remainingCents: 55000 }))).toBe('Il reste 550 € à verser.');
    expect(plain(describeMemberStatus({ status: 'PENDING', expectedCents: 175000, paidCents: 0, remainingCents: 175000 }))).toBe('Rien n’a encore été versé : il reste 1 750 € à verser.');
    expect(describeMemberStatus({ status: 'PAID', expectedCents: 1, paidCents: 1, remainingCents: 0 })).toBe('Contribution versée, merci !');
    expect(plain(describeMemberStatus({ status: 'OVERPAID', expectedCents: 100000, paidCents: 120000, remainingCents: 0 }))).toBe('Vous avez versé 200 € de plus que prévu.');
    expect(describeMemberStatus({ status: 'NONE', expectedCents: 0, paidCents: 0, remainingCents: 0 })).toBe('Rien à verser ce mois-ci.');
    expect(describeMemberStatus({ status: 'UNKNOWN', expectedCents: null, paidCents: 0, remainingCents: null })).toContain('il manque des revenus');
    expect(describeMemberStatus({ status: 'UNKNOWN', expectedCents: null, paidCents: 5000, remainingCents: null })).toBe('Le montant attendu ne peut pas encore être calculé.');
  });

  it('writes the progress and totals', () => {
    expect(plain(describeProgress({ expectedCents: 175000, paidCents: 120000 }))).toBe('1 200 € versés sur 1 750 € attendus');
    expect(describeProgress({ expectedCents: null, paidCents: 5 })).toBeNull();
    expect(describeProgress({ expectedCents: 0, paidCents: 5 })).toBeNull();
    expect(plain(describeTotals({ totalExpectedCents: 350000, totalPaidCents: 120000 }))).toBe('Total versé : 1 200 € sur 3 500 € attendus');
    expect(plain(describeTotals({ totalExpectedCents: null, totalPaidCents: 120000 }))).toBe('Total versé : 1 200 €');
  });

  it('computes the progress between 0 and 100', () => {
    expect(progressPercent({ expectedCents: 175000, paidCents: 120000 })).toBe(68);
    expect(progressPercent({ expectedCents: 100000, paidCents: 250000 })).toBe(100);
    expect(progressPercent({ expectedCents: 100000, paidCents: 0 })).toBe(0);
    expect(progressPercent({ expectedCents: null, paidCents: 10 })).toBeNull();
    expect(progressPercent({ expectedCents: 0, paidCents: 10 })).toBeNull();
  });

  it('knows who still has something to pay', () => {
    expect(needsPayment({ status: 'PENDING' })).toBe(true);
    expect(needsPayment({ status: 'PARTIAL' })).toBe(true);
    for (const status of ['PAID', 'OVERPAID', 'NONE', 'UNKNOWN'] as const) {
      expect(needsPayment({ status })).toBe(false);
    }
  });

  it('allows the current and the next month, not beyond', () => {
    expect(maxContributionMonth(NOW)).toBe('2026-12');
    expect(maxContributionMonth(new Date(2026, 11, 20))).toBe('2027-01');
  });

  it('describes a payment', () => {
    expect(plain(describePayment({ amountCents: 55000, date: '2026-11-03' }))).toBe('550 € le 3 novembre 2026');
  });
});

describe('emptyContributionForm', () => {
  it('prefills the amount with what remains, today’s date, « Fixe » and no account', () => {
    expect(emptyContributionForm({ remainingCents: 55050 }, NOW)).toEqual({ amount: '550,50', date: '2026-11-15', accountId: '', debitPersonal: false, personalBloc: 'FIXE', personalAccountId: '' });
  });

  it('leaves the amount empty when nothing remains or is unknown', () => {
    expect(emptyContributionForm({ remainingCents: 0 }, NOW).amount).toBe('');
    expect(emptyContributionForm({ remainingCents: null }, NOW).amount).toBe('');
    expect(emptyContributionForm(null, NOW).amount).toBe('');
  });
});

describe('buildContributionPayload', () => {
  it('builds the minimal payload: month, amount in cents and date', () => {
    expect(buildContributionPayload(validForm(), '2026-11')).toEqual({ ok: true, payload: { month: '2026-11', amountCents: 55000, date: '2026-11-03' } });
  });

  it('accepts a decimal amount with a comma or a point and spaces', () => {
    expect(buildContributionPayload(validForm({ amount: '1 200,50' }), '2026-11')).toMatchObject({ ok: true, payload: { amountCents: 120050 } });
    expect(buildContributionPayload(validForm({ amount: '875.5' }), '2026-11')).toMatchObject({ ok: true, payload: { amountCents: 87550 } });
  });

  it('sends the common account only when chosen', () => {
    expect(buildContributionPayload(validForm({ accountId: 'a1' }), '2026-11')).toMatchObject({ ok: true, payload: { accountId: 'a1' } });
    const result = buildContributionPayload(validForm(), '2026-11');
    expect(result.ok && 'accountId' in result.payload).toBe(false);
  });

  it('adds the personal debit, its bloc and its account only when the box is checked', () => {
    const checked = buildContributionPayload(validForm({ debitPersonal: true, personalBloc: 'COURANT', personalAccountId: 'p1' }), '2026-11');
    expect(checked).toEqual({ ok: true, payload: { month: '2026-11', amountCents: 55000, date: '2026-11-03', debitPersonal: true, personalBloc: 'COURANT', personalAccountId: 'p1' } });
    const noAccount = buildContributionPayload(validForm({ debitPersonal: true }), '2026-11');
    expect(noAccount).toEqual({ ok: true, payload: { month: '2026-11', amountCents: 55000, date: '2026-11-03', debitPersonal: true, personalBloc: 'FIXE' } });
  });

  it('never sends personal fields when the box is unchecked, even if a bloc or account was picked before', () => {
    const result = buildContributionPayload(validForm({ debitPersonal: false, personalBloc: 'PLAISIR', personalAccountId: 'p1' }), '2026-11');
    expect(result.ok && ['debitPersonal', 'personalBloc', 'personalAccountId'].some((key) => key in result.payload)).toBe(false);
  });

  it('requires an amount above 0', () => {
    expect(buildContributionPayload(validForm({ amount: '' }), '2026-11')).toEqual({ ok: false, errors: { amount: 'Indiquez le montant que vous avez versé.' } });
    expect(buildContributionPayload(validForm({ amount: '0' }), '2026-11')).toEqual({ ok: false, errors: { amount: 'Le montant doit être supérieur à 0.' } });
    expect(buildContributionPayload(validForm({ amount: '-5' }), '2026-11')).toMatchObject({ ok: false, errors: { amount: expect.stringContaining('Montant invalide') } });
    expect(buildContributionPayload(validForm({ amount: 'abc' }), '2026-11')).toMatchObject({ ok: false });
    expect(buildContributionPayload(validForm({ amount: '1,234' }), '2026-11')).toMatchObject({ ok: false });
  });

  it('requires a valid date and a valid month', () => {
    expect(buildContributionPayload(validForm({ date: '' }), '2026-11')).toEqual({ ok: false, errors: { date: 'Choisissez la date du versement.' } });
    expect(buildContributionPayload(validForm({ date: '2026-02-30' }), '2026-11')).toMatchObject({ ok: false });
    expect(buildContributionPayload(validForm(), '2026-13')).toMatchObject({ ok: false, errors: { month: expect.stringContaining('mois') } });
  });

  it('reports every error at once', () => {
    const result = buildContributionPayload(validForm({ amount: '', date: '' }), 'nope');
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['amount', 'date', 'month']);
  });
});
