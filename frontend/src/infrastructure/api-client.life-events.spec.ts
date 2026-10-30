import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError, NetworkError } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));

describe('apiClient life events', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond([]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('reads the catalog, without a household in the path', async () => {
    vi.stubGlobal(
      'fetch',
      respond([{ type: 'BIRTH', label: 'Naissance d’un enfant', description: 'x', steps: [{ id: 'birth-declaration', title: 'Déclarer', category: 'ADMIN', dueOffsetDays: 5, dueLabel: 'Dans les 5 jours', sourceLabel: 's', sourceUrl: 'https://x.test', verifiedOn: '2026-10-30', link: null }, { nope: true }] }]),
    );
    const catalog = await apiClient.fetchLifeEventCatalog();
    expect(lastCall()[0]).toBe('/api/life-events/catalog');
    expect(catalog).toHaveLength(1);
    expect(catalog[0].steps).toHaveLength(1);
    expect(catalog[0].steps[0]).toMatchObject({ id: 'birth-declaration', verifiedOn: '2026-10-30' });
  });

  it('reads the events of the household and fills in what the server forgot', async () => {
    vi.stubGlobal('fetch', respond([{ id: 'e1', eventDate: '2026-10-31', steps: [{ stepId: 'a', title: 'A', doneAt: '2026-10-30T08:00:00.000Z' }, { nope: true }] }, { nope: true }]));
    const events = await apiClient.fetchLifeEvents();
    expect(lastCall()[0]).toBe('/api/household/life-events');
    expect(lastCall()[1]).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'e1', label: 'Naissance d’un enfant', doneCount: 1, totalCount: 1, progressPercent: 100 });
  });

  it('creates an event and reads the full object of the 201 answer', async () => {
    vi.stubGlobal('fetch', respond({ id: 'e9', type: 'BIRTH', label: 'Bébé', eventDate: '2026-11-12', steps: [] }, 201));
    const created = await apiClient.createLifeEvent({ type: 'BIRTH', eventDate: '2026-11-12', label: 'Bébé' });
    expect(lastCall()[0]).toBe('/api/household/life-events');
    expect(lastCall()[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ type: 'BIRTH', eventDate: '2026-11-12', label: 'Bébé' }) });
    expect(created?.id).toBe('e9');
  });

  it('gives null when the answer to the creation cannot be read', async () => {
    vi.stubGlobal('fetch', respond({ surprise: true }, 201));
    expect(await apiClient.createLifeEvent({ type: 'BIRTH', eventDate: '2026-11-12' })).toBeNull();
  });

  it('updates, deletes and ticks, with the ids encoded in the path', async () => {
    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.updateLifeEvent('e 1', { eventDate: '2026-11-20', label: 'Bébé' });
    expect(lastCall()[0]).toBe('/api/household/life-events/e%201');
    expect(lastCall()[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ eventDate: '2026-11-20', label: 'Bébé' }) });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.deleteLifeEvent('e1');
    expect(lastCall()[0]).toBe('/api/household/life-events/e1');
    expect(lastCall()[1]).toMatchObject({ method: 'DELETE' });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.setLifeEventStep('e1', 'birth-declaration', { done: true, note: 'Fait' });
    expect(lastCall()[0]).toBe('/api/household/life-events/e1/steps/birth-declaration');
    expect(lastCall()[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ done: true, note: 'Fait' }) });
  });

  it('sends no note at all when ticking only (the server keeps the existing one)', async () => {
    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.setLifeEventStep('e1', 'a', { done: false });
    expect(lastCall()[1].body).toBe(JSON.stringify({ done: false }));
  });

  it('raises the server message, and a network error when offline', async () => {
    vi.stubGlobal('fetch', respond({ message: 'La date doit être comprise entre…' }, 400));
    await expect(apiClient.createLifeEvent({ type: 'BIRTH', eventDate: '1999-01-01' })).rejects.toMatchObject({ status: 400, message: 'La date doit être comprise entre…' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiClient.fetchLifeEvents()).rejects.toBeInstanceOf(NetworkError);
    vi.stubGlobal('fetch', respond({}, 404));
    await expect(apiClient.setLifeEventStep('x', 'y', { done: true })).rejects.toBeInstanceOf(ApiError);
  });
});
