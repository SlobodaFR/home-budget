import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { account } from '../test/fixtures';
import { describePaymentError, useContributionPayment, useContributionStatus, useSpaceAccounts } from './use-contribution-status';

const api = vi.hoisted(() => ({ fetchContributionStatus: vi.fn(), createContributionPayment: vi.fn(), fetchAccounts: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.fetchContributionStatus.mockResolvedValue({ month: '2026-11', incomplete: false, members: [], totalExpectedCents: 0, totalPaidCents: 0 });
  api.createContributionPayment.mockResolvedValue({ transactionId: 't1', personalTransactionId: null });
  api.fetchAccounts.mockResolvedValue([account()]);
});

describe('useContributionStatus', () => {
  it('loads the status of a month', async () => {
    const { result } = renderHook(() => useContributionStatus('2026-11'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data?.month).toBe('2026-11'));
    expect(api.fetchContributionStatus).toHaveBeenCalledWith('2026-11');
  });

  it('reloads when the month or the token changes', async () => {
    const { result, rerender } = renderHook(({ month, token }) => useContributionStatus(month, token), { initialProps: { month: '2026-11', token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ month: '2026-10', token: 0 });
    await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenLastCalledWith('2026-10'));
    rerender({ month: '2026-10', token: 1 });
    await waitFor(() => expect(api.fetchContributionStatus).toHaveBeenCalledTimes(3));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchContributionStatus.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useContributionStatus('2026-11'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchContributionStatus;
    api.fetchContributionStatus = undefined as never;
    const missing = renderHook(() => useContributionStatus('2026-11'));
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchContributionStatus = original;
  });
});

describe('useContributionPayment', () => {
  it('posts the payment once and returns the result', async () => {
    const { result } = renderHook(() => useContributionPayment());
    let value: unknown;
    await act(async () => {
      value = await result.current.pay({ month: '2026-11', amountCents: 55000, date: '2026-11-03' });
    });
    expect(value).toEqual({ transactionId: 't1', personalTransactionId: null });
    expect(api.createContributionPayment).toHaveBeenCalledWith({ month: '2026-11', amountCents: 55000, date: '2026-11-03' });
    expect(result.current.busy).toBe(false);
  });

  it('rethrows a failure and queues nothing', async () => {
    api.createContributionPayment.mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useContributionPayment());
    await act(async () => {
      await expect(result.current.pay({ month: '2026-11', amountCents: 1, date: '2026-11-03' })).rejects.toBeInstanceOf(NetworkError);
    });
    expect(api.createContributionPayment).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });
});

describe('useSpaceAccounts', () => {
  it('returns the accounts of the space, nothing without a space, nothing on failure', async () => {
    const { result } = renderHook(() => useSpaceAccounts('s-common'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(api.fetchAccounts).toHaveBeenCalledWith('s-common');
    const none = renderHook(() => useSpaceAccounts(null));
    await waitFor(() => expect(none.result.current).toEqual([]));
    expect(api.fetchAccounts).toHaveBeenCalledTimes(1);
    api.fetchAccounts.mockRejectedValue(new ApiError(500, 'boom'));
    const failing = renderHook(() => useSpaceAccounts('s-alice'));
    await waitFor(() => expect(api.fetchAccounts).toHaveBeenCalledWith('s-alice'));
    expect(failing.result.current).toEqual([]);
  });
});

describe('describePaymentError', () => {
  it('explains each failure and says nothing half-done was created', () => {
    expect(describePaymentError(new NetworkError())).toMatch(/hors ligne.*pas mis en attente.*saisies sont conservées/);
    expect(describePaymentError(new ApiError(400, ''))).toMatch(/pas été accepté.*Rien n’a été enregistré/);
    expect(describePaymentError(new ApiError(404, ''))).toMatch(/Aucun foyer/);
    expect(describePaymentError(new ApiError(401, ''))).toMatch(/session a expiré/);
    expect(describePaymentError(new ApiError(500, ''))).toMatch(/Rien n’a été enregistré/);
    expect(describePaymentError(new Error('?'))).toMatch(/a échoué/);
  });
});
