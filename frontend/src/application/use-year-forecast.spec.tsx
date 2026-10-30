import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { useYearForecast } from './use-year-forecast';

const api = vi.hoisted(() => ({ fetchYearForecast: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const forecast = { year: 2026, months: [], totalIncomeCents: 0, totalExpenseCents: 0, provisionHintCents: 0 };

describe('useYearForecast', () => {
  beforeEach(() => {
    api.fetchYearForecast.mockReset();
    api.fetchYearForecast.mockResolvedValue(forecast);
  });

  it('loads the year of the space', async () => {
    const { result } = renderHook(() => useYearForecast('s-common', 2026));
    await waitFor(() => expect(result.current.data).toEqual(forecast));
    expect(api.fetchYearForecast).toHaveBeenCalledWith('s-common', 2026);
  });

  it('drops the previous year while the next one loads', async () => {
    const { result, rerender } = renderHook(({ year }) => useYearForecast('s-common', year), { initialProps: { year: 2026 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    api.fetchYearForecast.mockResolvedValue({ ...forecast, year: 2027 });
    rerender({ year: 2027 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.year).toBe(2027));
    expect(api.fetchYearForecast).toHaveBeenLastCalledWith('s-common', 2027);
  });

  it('reloads when the token changes', async () => {
    const { result, rerender } = renderHook(({ token }) => useYearForecast('s-common', 2026, token), { initialProps: { token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ token: 1 });
    await waitFor(() => expect(api.fetchYearForecast).toHaveBeenCalledTimes(2));
  });

  it('exposes the error', async () => {
    api.fetchYearForecast.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useYearForecast('s-common', 2026));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
  });
});
