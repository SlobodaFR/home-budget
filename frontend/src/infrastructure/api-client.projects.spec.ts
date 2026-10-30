import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

const respond = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));

describe('apiClient projects, deposits and summary', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', respond([]));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastCall = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];

  it('reads the projects of a space and fills in what the server forgot', async () => {
    vi.stubGlobal('fetch', respond([{ id: 'x', name: 'Minimal', targetCents: 100000 }, { nope: true }]));
    const projects = await apiClient.fetchProjects('s 1');
    expect(lastCall()[0]).toBe('/api/spaces/s%201/projects');
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ name: 'Minimal', savedCents: 0, remainingCents: 100000, status: 'ON_TRACK', archived: false, accountId: null, targetDate: '' });
  });

  it('creates, updates and deletes a project', async () => {
    const payload = { name: 'Voiture', kind: 'PURCHASE' as const, targetCents: 800000, targetDate: '2028-04-30', startCents: 0, startDate: '2026-10-30' };
    vi.stubGlobal('fetch', respond({ id: 'p9', name: 'Voiture', targetCents: 800000 }, 201));
    expect((await apiClient.createProject('s1', payload))?.id).toBe('p9');
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects');
    expect(lastCall()[1]).toMatchObject({ method: 'POST', body: JSON.stringify(payload) });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.updateProject('s1', 'p9', { ...payload, archived: true });
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects/p9');
    expect(lastCall()[1]).toMatchObject({ method: 'PUT' });

    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.deleteProject('s1', 'p9');
    expect(lastCall()[1]).toMatchObject({ method: 'DELETE' });
  });

  it('reads the summary', async () => {
    vi.stubGlobal('fetch', respond({ totalMonthlyNeededCents: 61500, plannedEpargneCents: 50000, gapCents: 11500, activeCount: 2 }));
    expect(await apiClient.fetchProjectsSummary('s1')).toEqual({ totalMonthlyNeededCents: 61500, plannedEpargneCents: 50000, gapCents: 11500, activeCount: 2 });
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects/summary');
  });

  it('reads the deposits, newest first', async () => {
    vi.stubGlobal('fetch', respond([{ id: 'a', date: '2026-10-01', amountCents: 1000 }, { id: 'b', date: '2026-11-01', amountCents: -500, note: 'x' }]));
    const deposits = await apiClient.fetchDeposits('s1', 'p1');
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects/p1/deposits');
    expect(deposits.map((deposit) => deposit.id)).toEqual(['b', 'a']);
  });

  it('adds and removes a deposit', async () => {
    vi.stubGlobal('fetch', respond({ id: 'd1' }, 201));
    await apiClient.createDeposit('s1', 'p1', { date: '2026-11-01', amountCents: -500 });
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects/p1/deposits');
    expect(lastCall()[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ date: '2026-11-01', amountCents: -500 }) });
    vi.stubGlobal('fetch', respond(null, 204));
    await apiClient.deleteDeposit('s1', 'p1', 'd1');
    expect(lastCall()[0]).toBe('/api/spaces/s1/projects/p1/deposits/d1');
    expect(lastCall()[1]).toMatchObject({ method: 'DELETE' });
  });
});
