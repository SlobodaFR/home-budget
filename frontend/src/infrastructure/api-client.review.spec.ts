import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, NetworkError } from './api-client';

const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue(new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers }));

describe('apiClient reviews', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond([]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('reads the review of a month and fills in what the server forgot', async () => {
    vi.stubGlobal('fetch', respond({ month: '2026-10', status: 'DRAFT', answers: { decision: 'Une liste' } }));
    const review = await apiClient.fetchReview('s 1', '2026-10');
    expect(lastCall()[0]).toBe('/api/spaces/s%201/reviews/2026-10');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(review).toMatchObject({ month: '2026-10', status: 'DRAFT', completedAt: null });
    expect(review.answers).toEqual({ wentWell: '', surprise: '', decision: 'Une liste' });
    expect(review.snapshot.blocs).toHaveLength(4);
  });

  it('refuses an unreadable review instead of inventing one', async () => {
    vi.stubGlobal('fetch', respond('null'));
    await expect(apiClient.fetchReview('s1', '2026-10')).rejects.toBeInstanceOf(ApiError);
  });

  it('turns a refused future month into an ApiError', async () => {
    vi.stubGlobal('fetch', respond({ message: 'Mois futur' }, 400));
    await expect(apiClient.fetchReview('s1', '2030-01')).rejects.toMatchObject({ status: 400, message: 'Mois futur' });
  });

  it('saves a review with PUT, answers and complete flag', async () => {
    vi.stubGlobal('fetch', respond(null, 204));
    const payload = { answers: { wentWell: 'a', surprise: 'b', decision: 'c' }, complete: true };
    await apiClient.saveReview('s1', '2026-10', payload);
    expect(lastCall()[0]).toBe('/api/spaces/s1/reviews/2026-10');
    expect(lastCall()[1]).toMatchObject({ method: 'PUT', body: JSON.stringify(payload) });
  });

  it('reads the history with the default limit of 12, newest first', async () => {
    vi.stubGlobal('fetch', respond([{ month: '2026-08', status: 'DONE', decision: 'x', completedAt: '2026-09-01T00:00:00.000Z' }, { month: '2026-09', status: 'DRAFT', decision: '' }]));
    const items = await apiClient.fetchReviews('s1');
    expect(lastCall()[0]).toBe('/api/spaces/s1/reviews?limit=12');
    expect(items.map((item) => item.month)).toEqual(['2026-09', '2026-08']);
  });

  it('reports a network failure as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiClient.saveReview('s1', '2026-10', { answers: { wentWell: '', surprise: '', decision: '' }, complete: false })).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('apiClient exports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('downloads the JSON backup with the cookies and takes the file name from Content-Disposition', async () => {
    vi.stubGlobal('fetch', respond({ version: 1 }, 200, { 'Content-Disposition': 'attachment; filename="budget-export-2026-10-29.json"' }));
    const file = await apiClient.downloadExport(new Date(2026, 9, 30));
    expect(lastCall()[0]).toBe('/api/export');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(file.filename).toBe('budget-export-2026-10-29.json');
    expect(await file.blob.text()).toBe('{"version":1}');
  });

  it('falls back to budget-export-AAAA-MM-JJ.json without a header', async () => {
    vi.stubGlobal('fetch', respond({ version: 1 }));
    expect((await apiClient.downloadExport(new Date(2026, 9, 30))).filename).toBe('budget-export-2026-10-30.json');
  });

  it('downloads the CSV of a space and a period', async () => {
    vi.stubGlobal('fetch', respond('Date;Type\n', 200, { 'Content-Disposition': 'attachment; filename="operations-2026-01-01_2026-10-30.csv"' }));
    const file = await apiClient.downloadTransactionsCsv('s 1', { from: '2026-01-01', to: '2026-10-30' });
    expect(lastCall()[0]).toBe('/api/spaces/s%201/transactions/export?from=2026-01-01&to=2026-10-30');
    expect(file.filename).toBe('operations-2026-01-01_2026-10-30.csv');
  });

  it('falls back to operations-DU_AU.csv', async () => {
    vi.stubGlobal('fetch', respond('Date;Type\n'));
    expect((await apiClient.downloadTransactionsCsv('s1', { from: '2026-01-01', to: '2026-10-30' })).filename).toBe('operations-2026-01-01_2026-10-30.csv');
  });

  it('raises the status of a refusal (no household, period too long)', async () => {
    vi.stubGlobal('fetch', respond({ message: 'Foyer introuvable' }, 404));
    await expect(apiClient.downloadExport()).rejects.toMatchObject({ status: 404, message: 'Foyer introuvable' });
    vi.stubGlobal('fetch', respond({ message: ['Période trop longue'] }, 400));
    await expect(apiClient.downloadTransactionsCsv('s1', { from: '2020-01-01', to: '2026-01-01' })).rejects.toMatchObject({ status: 400, message: 'Période trop longue' });
  });

  it('reports a network failure as a NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiClient.downloadExport()).rejects.toBeInstanceOf(NetworkError);
  });
});
