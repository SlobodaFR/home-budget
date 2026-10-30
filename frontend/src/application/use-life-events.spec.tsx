import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { lifeEvent, lifeEventCatalog } from '../test/fixtures';
import { useLifeEventCatalog, useLifeEvents } from './use-life-events';

const api = vi.hoisted(() => ({ fetchLifeEvents: vi.fn(), fetchLifeEventCatalog: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

describe('useLifeEvents', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchLifeEvents.mockResolvedValue([lifeEvent()]);
    api.fetchLifeEventCatalog.mockResolvedValue(lifeEventCatalog());
  });

  it('loads the events of the household', async () => {
    const { result } = renderHook(() => useLifeEvents());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual([lifeEvent()]));
    expect(api.fetchLifeEvents).toHaveBeenCalledTimes(1);
  });

  it('reloads when the token changes', async () => {
    const { result, rerender } = renderHook(({ token }) => useLifeEvents(token), { initialProps: { token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ token: 1 });
    await waitFor(() => expect(api.fetchLifeEvents).toHaveBeenCalledTimes(2));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchLifeEvents.mockRejectedValue(new ApiError(404, 'nope'));
    const { result } = renderHook(() => useLifeEvents());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchLifeEvents;
    api.fetchLifeEvents = undefined as never;
    const missing = renderHook(() => useLifeEvents());
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchLifeEvents = original;
  });

  it('loads the catalog', async () => {
    const { result } = renderHook(() => useLifeEventCatalog());
    await waitFor(() => expect(result.current.data?.[0].type).toBe('BIRTH'));
    expect(api.fetchLifeEventCatalog).toHaveBeenCalledTimes(1);
  });
});
