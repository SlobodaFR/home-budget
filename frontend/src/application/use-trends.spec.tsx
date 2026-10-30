import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { useTrends } from './use-trends';

const api = vi.hoisted(() => ({ fetchTrends: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

describe('useTrends', () => {
  beforeEach(() => {
    api.fetchTrends.mockReset();
    api.fetchTrends.mockResolvedValue({ months: [] });
  });

  it('loads the trends of the space for a window', async () => {
    const { result } = renderHook(() => useTrends('s-common', 6));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ months: [] }));
    expect(api.fetchTrends).toHaveBeenCalledWith('s-common', 6);
  });

  it('reloads when the window or the space changes', async () => {
    const { result, rerender } = renderHook(({ id, months }) => useTrends(id, months), { initialProps: { id: 's-common', months: 6 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ id: 's-common', months: 12 });
    await waitFor(() => expect(api.fetchTrends).toHaveBeenLastCalledWith('s-common', 12));
    rerender({ id: 's-alice', months: 12 });
    await waitFor(() => expect(api.fetchTrends).toHaveBeenLastCalledWith('s-alice', 12));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchTrends.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useTrends('s-common', 6));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchTrends;
    api.fetchTrends = undefined as never;
    const missing = renderHook(() => useTrends('s-common', 6));
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchTrends = original;
  });
});
