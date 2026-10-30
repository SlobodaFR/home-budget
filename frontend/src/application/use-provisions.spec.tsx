import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { useProvisions } from './use-provisions';

const api = vi.hoisted(() => ({ fetchProvisions: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const provisions = { asOf: '2026-10-30', items: [], totalMonthlyProvisionCents: 0, totalNextTwelveMonthsCents: 0 };

describe('useProvisions', () => {
  beforeEach(() => {
    api.fetchProvisions.mockReset();
    api.fetchProvisions.mockResolvedValue(provisions);
  });

  it('loads the provisions of the space', async () => {
    const { result } = renderHook(() => useProvisions('s-common'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(provisions));
    expect(api.fetchProvisions).toHaveBeenCalledWith('s-common');
  });

  it('reloads when the token changes (a recurring payment was edited)', async () => {
    const { result, rerender } = renderHook(({ token }) => useProvisions('s-common', token), { initialProps: { token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ token: 1 });
    await waitFor(() => expect(api.fetchProvisions).toHaveBeenCalledTimes(2));
  });

  it('loads another space', async () => {
    const { result, rerender } = renderHook(({ id }) => useProvisions(id), { initialProps: { id: 's-common' } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ id: 's-alice' });
    await waitFor(() => expect(api.fetchProvisions).toHaveBeenLastCalledWith('s-alice'));
  });

  it('exposes the error and can retry', async () => {
    api.fetchProvisions.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useProvisions('s-common'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    result.current.reload();
    await waitFor(() => expect(result.current.data).toEqual(provisions));
  });
});
