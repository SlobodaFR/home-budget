import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, NetworkError } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('apiClient contributions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('reads the status of a month with the cookies, tolerantly', async () => {
    vi.stubGlobal('fetch', respond({ members: [{ userId: 'a', name: 'Alice', expectedCents: 1000, paidCents: 400, isMe: true }] }));
    const report = await apiClient.fetchContributionStatus('2026-11');
    expect(lastCall()[0]).toBe('/api/household/contributions/status?month=2026-11');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(report.month).toBe('2026-11');
    expect(report.members[0]).toMatchObject({ status: 'PARTIAL', remainingCents: 600, isMe: true });
  });

  it('posts a payment with a JSON body and reads the ids', async () => {
    vi.stubGlobal('fetch', respond({ transactionId: 't1', personalTransactionId: 't2' }, 201));
    const payload = { month: '2026-11', amountCents: 55000, date: '2026-11-03', debitPersonal: true, personalBloc: 'FIXE' as const };
    expect(await apiClient.createContributionPayment(payload)).toEqual({ transactionId: 't1', personalTransactionId: 't2' });
    expect(lastCall()[0]).toBe('/api/household/contributions/payments');
    expect(lastCall()[1]).toMatchObject({ method: 'POST', body: JSON.stringify(payload) });
  });

  it('raises the status of a refusal and a network failure', async () => {
    vi.stubGlobal('fetch', respond({ message: ['amountCents invalide'] }, 400));
    await expect(apiClient.createContributionPayment({ month: '2026-11', amountCents: 0, date: '2026-11-03' })).rejects.toMatchObject({ status: 400, message: 'amountCents invalide' });
    vi.stubGlobal('fetch', respond({ message: 'Foyer introuvable' }, 404));
    await expect(apiClient.fetchContributionStatus('2026-11')).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiClient.createContributionPayment({ month: '2026-11', amountCents: 1, date: '2026-11-03' })).rejects.toBeInstanceOf(NetworkError);
  });
});
