import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, NetworkError } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));

describe('apiClient debts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond([]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
  const payload = {
    name: 'Prêt auto',
    kind: 'CAR' as const,
    principalCents: 1500000,
    remainingCents: 1120000,
    annualRatePercent: 3.9,
    monthlyPaymentCents: 32000,
    startDate: '2024-09-01',
    paymentDay: 5,
    insuranceMonthlyCents: 1500,
    recurringId: null,
  };

  it('reads the debts of a space and fills in what the server forgot', async () => {
    vi.stubGlobal('fetch', respond([{ id: 'x', name: 'Minimal', principalCents: 100000 }, { nope: true }]));
    const debts = await apiClient.fetchDebts('s 1');
    expect(lastCall()[0]).toBe('/api/spaces/s%201/debts');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({ name: 'Minimal', remainingCents: 100000, neverPaidOff: false, archived: false, recurringId: null });
  });

  it('creates, updates and deletes a debt', async () => {
    vi.stubGlobal('fetch', respond({ id: 'd9', name: 'Prêt auto', principalCents: 1500000 }, 201));
    expect((await apiClient.createDebt('s1', payload))?.id).toBe('d9');
    expect(lastCall()[0]).toBe('/api/spaces/s1/debts');
    expect(lastCall()[1]).toMatchObject({ method: 'POST', body: JSON.stringify(payload) });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.updateDebt('s1', 'd9', { ...payload, archived: true });
    expect(lastCall()[0]).toBe('/api/spaces/s1/debts/d9');
    expect(lastCall()[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ ...payload, archived: true }) });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.deleteDebt('s1', 'd9');
    expect(lastCall()[1]).toMatchObject({ method: 'DELETE' });
  });

  it('reads the summary', async () => {
    vi.stubGlobal('fetch', respond({ activeCount: 2, totalRemainingCents: 21800000, totalMonthlyCents: 112000, debtToIncomePercent: 31 }));
    expect(await apiClient.fetchDebtsSummary('s1')).toEqual({ activeCount: 2, totalRemainingCents: 21800000, totalMonthlyCents: 112000, debtToIncomePercent: 31 });
    expect(lastCall()[0]).toBe('/api/spaces/s1/debts/summary');
  });

  it('asks for a what-if with both amounts in cents', async () => {
    vi.stubGlobal(
      'fetch',
      respond({
        baseline: { monthsRemaining: 38, totalInterestRemainingCents: 96000, payoffDate: '2029-12-05' },
        scenario: { monthsRemaining: 29, totalInterestRemainingCents: 69000, payoffDate: '2029-03-05' },
        interestSavedCents: 27000,
        monthsSaved: 9,
        note: 'Vérifiez les indemnités.',
      }),
    );
    const result = await apiClient.fetchDebtWhatIf('s 1', 'd 1', { extraMonthlyCents: 10000, lumpSumCents: 0 });
    expect(lastCall()[0]).toBe('/api/spaces/s%201/debts/d%201/what-if?extraMonthlyCents=10000&lumpSumCents=0');
    expect(result).toMatchObject({ interestSavedCents: 27000, monthsSaved: 9, note: 'Vérifiez les indemnités.' });
  });

  it('refuses an unreadable what-if instead of inventing one', async () => {
    vi.stubGlobal('fetch', respond({}));
    await expect(apiClient.fetchDebtWhatIf('s1', 'd1', { extraMonthlyCents: 1, lumpSumCents: 0 })).rejects.toBeInstanceOf(ApiError);
  });

  it('raises the status of a refusal and a network failure', async () => {
    vi.stubGlobal('fetch', respond({ message: 'Au moins un montant' }, 400));
    await expect(apiClient.fetchDebtWhatIf('s1', 'd1', { extraMonthlyCents: 0, lumpSumCents: 0 })).rejects.toMatchObject({ status: 400, message: 'Au moins un montant' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiClient.fetchDebts('s1')).rejects.toBeInstanceOf(NetworkError);
  });
});
