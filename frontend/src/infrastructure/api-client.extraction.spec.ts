import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawExtractionJob, rawExtractionResult } from '../test/fixtures';
import { ApiError, apiClient, NetworkError } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));

describe('apiClient contract extraction', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond({}));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('reads the capabilities without caching them', async () => {
    vi.stubGlobal('fetch', respond({ available: true, engines: ['tesseract'], maxFileBytes: 1048576, maxPages: 40 }));
    expect(await apiClient.fetchDebtExtractionCapabilities()).toEqual({ available: true, maxFileBytes: 1048576, maxPages: 40 });
    expect(lastCall()[0]).toBe('/api/debt-extractions/capabilities');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
  });

  it('sends the file as multipart form data under the field « file », without setting the Content-Type by hand', async () => {
    vi.stubGlobal('fetch', respond({ jobId: 'job 1', expiresAt: '2026-11-01T12:15:00.000Z' }, 202));
    const file = new File(['%PDF-1.4 contenu'], 'contrat.pdf', { type: 'application/pdf' });
    const started = await apiClient.startDebtExtraction('s 1', file);

    expect(started.jobId).toBe('job 1');
    const [url, init] = lastCall();
    expect(url).toBe('/api/spaces/s%201/debts/extract');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
    const sent = (init.body as FormData).get('file') as File;
    expect(sent.name).toBe('contrat.pdf');
    expect(sent.type).toBe('application/pdf');
    expect([...(init.body as FormData).keys()]).toEqual(['file']);
  });

  it('refuses a start response without a job id', async () => {
    vi.stubGlobal('fetch', respond({ nope: true }, 202));
    await expect(apiClient.startDebtExtraction('s1', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ status: 502 });
  });

  it('turns the refusals of the server into errors that carry the status', async () => {
    for (const status of [400, 429, 503]) {
      vi.stubGlobal('fetch', respond({ message: 'non' }, status));
      await expect(apiClient.startDebtExtraction('s1', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ status });
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiClient.startDebtExtraction('s1', new File(['x'], 'a.pdf'))).rejects.toBeInstanceOf(NetworkError);
  });

  it('reads a job tolerantly and never caches it', async () => {
    vi.stubGlobal('fetch', respond({ status: 'DONE', stage: null, progressPercent: 100, result: rawExtractionResult({ extra: 1 }), futur: true }));
    const job = await apiClient.fetchDebtExtraction('a/b');
    expect(lastCall()[0]).toBe('/api/debt-extractions/a%2Fb');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', cache: 'no-store' });
    expect(job.status).toBe('DONE');
    expect(job.result?.fields).toHaveLength(5);
  });

  it('refuses an unreadable job and keeps the 404 of an expired one', async () => {
    vi.stubGlobal('fetch', respond({ status: '???' }));
    await expect(apiClient.fetchDebtExtraction('j')).rejects.toMatchObject({ status: 502 });
    vi.stubGlobal('fetch', respond({ message: 'introuvable' }, 404));
    const error = await apiClient.fetchDebtExtraction('j').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it('deletes the result on the server', async () => {
    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.deleteDebtExtraction('job 1');
    expect(lastCall()[0]).toBe('/api/debt-extractions/job%201');
    expect(lastCall()[1]).toMatchObject({ method: 'DELETE', credentials: 'include' });
  });

  it('still sends the other requests as JSON', async () => {
    vi.stubGlobal('fetch', respond({ ok: true }));
    await apiClient.fetchDebtExtraction('x').catch(() => undefined);
    vi.stubGlobal('fetch', respond(rawExtractionJob()));
    await apiClient.createDebt('s1', {} as never).catch(() => undefined);
    expect(lastCall()[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  });
});
