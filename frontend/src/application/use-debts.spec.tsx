import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { debt, debtPayload, debtsSummary } from '../test/fixtures';
import { useDebtActions } from './use-debt-actions';
import { useDebtWhatIf } from './use-debt-what-if';
import { useDebts, useDebtsSummary } from './use-debts';
import { useRecurringOptions } from './use-recurring-options';
import type { ApiMock } from '../test/api-mock';

const api = vi.hoisted(() => ({
  fetchDebts: vi.fn<ApiMock<'fetchDebts'>>(),
  fetchDebtsSummary: vi.fn<ApiMock<'fetchDebtsSummary'>>(),
  createDebt: vi.fn<ApiMock<'createDebt'>>(),
  updateDebt: vi.fn<ApiMock<'updateDebt'>>(),
  deleteDebt: vi.fn<ApiMock<'deleteDebt'>>(),
  fetchDebtWhatIf: vi.fn<ApiMock<'fetchDebtWhatIf'>>(),
  fetchRecurring: vi.fn<ApiMock<'fetchRecurring'>>(),
}));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const whatIf = {
  baseline: { monthsRemaining: 38, totalInterestRemainingCents: 96000, payoffDate: '2029-12-05' },
  scenario: { monthsRemaining: 29, totalInterestRemainingCents: 69000, payoffDate: '2029-03-05' },
  interestSavedCents: 27000,
  monthsSaved: 9,
  note: 'Vérifiez.',
};

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.fetchDebts.mockResolvedValue([debt()]);
  api.fetchDebtsSummary.mockResolvedValue(debtsSummary({ activeCount: 1, totalRemainingCents: 1120000, totalMonthlyCents: 33500 }));
  api.createDebt.mockResolvedValue(debt());
  api.updateDebt.mockResolvedValue(undefined);
  api.deleteDebt.mockResolvedValue(undefined);
  api.fetchDebtWhatIf.mockResolvedValue(whatIf);
  api.fetchRecurring.mockResolvedValue([]);
});

describe('useDebts', () => {
  it('loads the debts of the space and the summary', async () => {
    const { result } = renderHook(() => useDebts('s-common'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual([debt()]));
    expect(api.fetchDebts).toHaveBeenCalledWith('s-common');
    const summary = renderHook(() => useDebtsSummary('s-common'));
    await waitFor(() => expect(summary.result.current.data?.debtToIncomePercent).toBe(31));
  });

  it('reloads when the token or the space changes', async () => {
    const { result, rerender } = renderHook(({ id, token }) => useDebts(id, token), { initialProps: { id: 's-common', token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ id: 's-common', token: 1 });
    await waitFor(() => expect(api.fetchDebts).toHaveBeenCalledTimes(2));
    rerender({ id: 's-alice', token: 1 });
    await waitFor(() => expect(api.fetchDebts).toHaveBeenLastCalledWith('s-alice'));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchDebts.mockRejectedValue(new ApiError(404, 'nope'));
    const { result } = renderHook(() => useDebts('s-common'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchDebts;
    api.fetchDebts = undefined as never;
    const missing = renderHook(() => useDebts('s-common'));
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchDebts = original;
  });
});

describe('useDebtActions', () => {
  it('creates, then tells the page to refresh', async () => {
    const onChanged = vi.fn<() => void>();
    const { result } = renderHook(() => useDebtActions('s-common', onChanged));
    const payload = debtPayload({ name: 'x', principalCents: 1, remainingCents: 1, annualRatePercent: 0, monthlyPaymentCents: 1, startDate: '2026-10-01', paymentDay: 1, insuranceMonthlyCents: 0 });
    await act(async () => {
      await result.current.create(payload);
    });
    expect(api.createDebt).toHaveBeenCalledWith('s-common', payload);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('keeps the archived flag of the debt when editing it', async () => {
    const { result } = renderHook(() => useDebtActions('s-common', vi.fn()));
    const archived = debt({ archived: true });
    await act(async () => {
      await result.current.update(archived, debtPayload({ name: 'Autre', principalCents: 1, remainingCents: 1, annualRatePercent: 0, monthlyPaymentCents: 1, startDate: '2026-10-01', paymentDay: 1, insuranceMonthlyCents: 0 }));
    });
    expect(api.updateDebt).toHaveBeenCalledWith('s-common', 'd1', expect.objectContaining({ name: 'Autre', archived: true }));
  });

  it('archives and unarchives with the full payload, and deletes', async () => {
    const { result } = renderHook(() => useDebtActions('s-common', vi.fn()));
    await act(async () => {
      await result.current.setArchived(debt(), true);
      await result.current.remove(debt());
    });
    expect(api.updateDebt).toHaveBeenCalledWith('s-common', 'd1', expect.objectContaining({ name: 'Prêt auto', monthlyPaymentCents: 32000, archived: true }));
    expect(api.deleteDebt).toHaveBeenCalledWith('s-common', 'd1');
  });

  it('sends every contract field again when archiving (a PUT replaces the whole debt)', async () => {
    const detailed = debt({
      lender: 'Crédit Agricole',
      contractReference: 'PRET-12345',
      initialTermMonths: 240,
      rateType: 'ADJUSTABLE',
      insuranceMode: 'PERCENT_REMAINING',
      insuranceRatePercent: 0.3,
      insuranceQuotityPercent: 200,
      feesCents: 90000,
      guaranteeKind: 'SURETY',
      guaranteeCents: 150000,
      notes: 'Remboursement anticipé : 3 % max.',
    });
    const { result } = renderHook(() => useDebtActions('s-common', vi.fn()));
    await act(async () => {
      await result.current.setArchived(detailed, true);
    });
    expect(api.updateDebt).toHaveBeenCalledWith(
      's-common',
      'd1',
      expect.objectContaining({
        lender: 'Crédit Agricole',
        contractReference: 'PRET-12345',
        initialTermMonths: 240,
        rateType: 'ADJUSTABLE',
        insuranceMode: 'PERCENT_REMAINING',
        insuranceRatePercent: 0.3,
        insuranceQuotityPercent: 200,
        feesCents: 90000,
        guaranteeKind: 'SURETY',
        guaranteeCents: 150000,
        notes: 'Remboursement anticipé : 3 % max.',
        archived: true,
      }),
    );
  });

  it('rejects and does not refresh when the request fails', async () => {
    api.deleteDebt.mockRejectedValue(new NetworkError());
    const onChanged = vi.fn<() => void>();
    const { result } = renderHook(() => useDebtActions('s-common', onChanged));
    await act(async () => {
      await expect(result.current.remove(debt())).rejects.toBeInstanceOf(NetworkError);
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('useDebtWhatIf', () => {
  it('starts idle, then loads and returns the result', async () => {
    const { result } = renderHook(() => useDebtWhatIf('s-common', 'd1'));
    expect(result.current.state).toEqual({ status: 'idle' });
    const query = { extraMonthlyCents: 10000, lumpSumCents: 0 };
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.run(query);
    });
    expect(result.current.state.status).toBe('loading');
    await act(async () => {
      await pending;
    });
    expect(api.fetchDebtWhatIf).toHaveBeenCalledWith('s-common', 'd1', query);
    expect(result.current.state).toMatchObject({ status: 'ready', query });
  });

  it('exposes an error and lets you retry with the same query', async () => {
    api.fetchDebtWhatIf.mockRejectedValueOnce(new NetworkError());
    const { result } = renderHook(() => useDebtWhatIf('s-common', 'd1'));
    const query = { extraMonthlyCents: 0, lumpSumCents: 5000 };
    await act(async () => {
      await result.current.run(query);
    });
    expect(result.current.state).toMatchObject({ status: 'error', query });
    await act(async () => {
      await result.current.run(query);
    });
    expect(result.current.state.status).toBe('ready');
  });

  it('ignores a late answer after a reset', async () => {
    let release: (value: unknown) => void = () => undefined;
    api.fetchDebtWhatIf.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useDebtWhatIf('s-common', 'd1'));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.run({ extraMonthlyCents: 1, lumpSumCents: 0 });
    });
    act(() => result.current.reset());
    await act(async () => {
      release(whatIf);
      await pending;
    });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('goes back to idle when the debt changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useDebtWhatIf('s-common', id), { initialProps: { id: 'd1' } });
    await act(async () => {
      await result.current.run({ extraMonthlyCents: 1, lumpSumCents: 0 });
    });
    expect(result.current.state.status).toBe('ready');
    rerender({ id: 'd2' });
    await waitFor(() => expect(result.current.state.status).toBe('idle'));
  });
});

describe('useRecurringOptions', () => {
  it('returns the recurring payments, or an empty list on failure', async () => {
    api.fetchRecurring.mockResolvedValue([{ id: 'r1' }]);
    const { result } = renderHook(() => useRecurringOptions('s-common'));
    await waitFor(() => expect(result.current).toEqual([{ id: 'r1' }]));
    api.fetchRecurring.mockRejectedValue(new ApiError(500, 'boom'));
    const failing = renderHook(() => useRecurringOptions('s-alice'));
    await waitFor(() => expect(api.fetchRecurring).toHaveBeenCalledWith('s-alice'));
    expect(failing.result.current).toEqual([]);
  });
});
