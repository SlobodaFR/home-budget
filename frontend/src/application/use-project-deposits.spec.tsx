import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { useProjectDeposits } from './use-project-deposits';

const api = vi.hoisted(() => ({ fetchDeposits: vi.fn(), createDeposit: vi.fn(), deleteDeposit: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const deposits = [{ id: 'd1', date: '2026-11-15', amountCents: 20000, note: 'Prime' }];

describe('useProjectDeposits', () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    onChanged.mockReset();
    api.fetchDeposits.mockResolvedValue(deposits);
    api.createDeposit.mockResolvedValue({});
    api.deleteDeposit.mockResolvedValue(undefined);
  });

  it('loads the deposits of the project', async () => {
    const { result } = renderHook(() => useProjectDeposits('s-common', 'p1', onChanged));
    await waitFor(() => expect(result.current.deposits.data).toEqual(deposits));
    expect(api.fetchDeposits).toHaveBeenCalledWith('s-common', 'p1');
  });

  it('adds a deposit, reloads the list and tells the page the totals changed', async () => {
    const { result } = renderHook(() => useProjectDeposits('s-common', 'p1', onChanged));
    await waitFor(() => expect(result.current.deposits.data).toBeDefined());
    await act(() => result.current.add({ date: '2026-12-01', amountCents: -5000, note: 'Réparation' }));
    expect(api.createDeposit).toHaveBeenCalledWith('s-common', 'p1', { date: '2026-12-01', amountCents: -5000, note: 'Réparation' });
    await waitFor(() => expect(api.fetchDeposits).toHaveBeenCalledTimes(2));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('removes a deposit', async () => {
    const { result } = renderHook(() => useProjectDeposits('s-common', 'p1', onChanged));
    await waitFor(() => expect(result.current.deposits.data).toBeDefined());
    await act(() => result.current.remove('d1'));
    expect(api.deleteDeposit).toHaveBeenCalledWith('s-common', 'p1', 'd1');
    expect(onChanged).toHaveBeenCalled();
  });

  it('lets the caller handle a refusal (balance would go negative) without refreshing anything', async () => {
    api.deleteDeposit.mockRejectedValue(new ApiError(400, 'négatif'));
    const { result } = renderHook(() => useProjectDeposits('s-common', 'p1', onChanged));
    await waitFor(() => expect(result.current.deposits.data).toBeDefined());
    await act(async () => {
      await expect(result.current.remove('d1')).rejects.toBeInstanceOf(ApiError);
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(api.fetchDeposits).toHaveBeenCalledTimes(1);
  });

  it('exposes a loading error', async () => {
    api.fetchDeposits.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useProjectDeposits('s-common', 'p1', onChanged));
    await waitFor(() => expect(result.current.deposits.error).toBeInstanceOf(ApiError));
  });
});
