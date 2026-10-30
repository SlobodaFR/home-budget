import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, NetworkError } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('apiClient trends', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('asks for a window of months and reads the answer tolerantly', async () => {
    vi.stubGlobal('fetch', respond({ months: [{ month: '2026-10', incomeCents: 1000, expenseCents: 400 }], risers: 'x' }));
    const trends = await apiClient.fetchTrends('s 1', 12);
    expect(lastCall()[0]).toBe('/api/spaces/s%201/trends?months=12');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(trends.months[0]).toMatchObject({ balanceCents: 600, savingsRatePercent: 60 });
    expect(trends.risers).toEqual([]);
  });

  it('can name the last month of the window', async () => {
    vi.stubGlobal('fetch', respond({}));
    await apiClient.fetchTrends('s1', 6, '2026-09');
    expect(lastCall()[0]).toBe('/api/spaces/s1/trends?months=6&to=2026-09');
  });

  it('raises a refusal and a network failure', async () => {
    vi.stubGlobal('fetch', respond({ message: 'months invalide' }, 400));
    await expect(apiClient.fetchTrends('s1', 99)).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiClient.fetchTrends('s1', 6)).rejects.toBeInstanceOf(NetworkError);
  });
});
