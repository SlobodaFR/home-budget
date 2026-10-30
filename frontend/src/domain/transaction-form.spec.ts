import { describe, expect, it } from 'vitest';
import { buildTransactionPayload, TransactionFormValues } from './transaction-form';

const NOW = new Date(2026, 9, 20, 12, 0, 0);

const values = (overrides: Partial<TransactionFormValues> = {}): TransactionFormValues => ({
  kind: 'EXPENSE',
  amount: '12,50',
  bloc: 'COURANT',
  label: '',
  date: '2026-10-03',
  ...overrides,
});

describe('buildTransactionPayload', () => {
  it('builds an expense with the French decimal comma', () => {
    expect(buildTransactionPayload(values({ label: ' Marché ' }), NOW)).toEqual({
      ok: true,
      payload: { kind: 'EXPENSE', bloc: 'COURANT', label: 'Marché', amountCents: 1250, date: '2026-10-03T00:00:00.000Z' },
    });
  });

  it('falls back to the bloc name when no label is given', () => {
    const result = buildTransactionPayload(values({ bloc: 'PLAISIR' }), NOW);
    expect(result.ok && result.payload.label).toBe('Plaisir');
  });

  it('builds an income without bloc', () => {
    const result = buildTransactionPayload(values({ kind: 'INCOME', amount: '2000' }), NOW);
    expect(result).toEqual({
      ok: true,
      payload: { kind: 'INCOME', label: 'Revenu', amountCents: 200000, date: '2026-10-03T00:00:00.000Z' },
    });
  });

  it('rejects an empty, invalid or null amount', () => {
    expect(buildTransactionPayload(values({ amount: '' }), NOW)).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    expect(buildTransactionPayload(values({ amount: 'abc' }), NOW)).toMatchObject({ ok: false });
    expect(buildTransactionPayload(values({ amount: '0' }), NOW)).toMatchObject({ ok: false });
  });

  it('rejects an invalid date', () => {
    expect(buildTransactionPayload(values({ date: '' }), NOW)).toMatchObject({ ok: false, errors: { date: expect.any(String) } });
  });

  it('truncates overly long labels', () => {
    const result = buildTransactionPayload(values({ label: 'x'.repeat(100) }), NOW);
    expect(result.ok && result.payload.label).toHaveLength(40);
  });

  it('keeps the original date when editing without changing the day', () => {
    const result = buildTransactionPayload(values(), NOW, { date: '2026-10-03T14:22:00.000Z' });
    expect(result.ok && result.payload.date).toBe('2026-10-03T14:22:00.000Z');
  });
});
