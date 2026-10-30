import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { project } from '../test/fixtures';
import { useProjects, useProjectsSummary } from './use-projects';

const api = vi.hoisted(() => ({ fetchProjects: vi.fn(), fetchProjectsSummary: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

describe('useProjects', () => {
  beforeEach(() => {
    api.fetchProjects.mockReset();
    api.fetchProjectsSummary.mockReset();
    api.fetchProjects.mockResolvedValue([project()]);
    api.fetchProjectsSummary.mockResolvedValue({ totalMonthlyNeededCents: 32500, plannedEpargneCents: 20000, gapCents: 12500, activeCount: 1 });
  });

  it('loads the projects of the space', async () => {
    const { result } = renderHook(() => useProjects('s-common'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual([project()]));
    expect(api.fetchProjects).toHaveBeenCalledWith('s-common');
  });

  it('reloads when the token changes and when the space changes', async () => {
    const { result, rerender } = renderHook(({ id, token }) => useProjects(id, token), { initialProps: { id: 's-common', token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ id: 's-common', token: 1 });
    await waitFor(() => expect(api.fetchProjects).toHaveBeenCalledTimes(2));
    rerender({ id: 's-alice', token: 1 });
    await waitFor(() => expect(api.fetchProjects).toHaveBeenLastCalledWith('s-alice'));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchProjects.mockRejectedValue(new ApiError(404, 'nope'));
    const { result } = renderHook(() => useProjects('s-common'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchProjects;
    api.fetchProjects = undefined as never;
    const missing = renderHook(() => useProjects('s-common'));
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchProjects = original;
  });

  it('loads the summary', async () => {
    const { result } = renderHook(() => useProjectsSummary('s-common'));
    await waitFor(() => expect(result.current.data?.gapCents).toBe(12500));
    expect(api.fetchProjectsSummary).toHaveBeenCalledWith('s-common');
  });
});
