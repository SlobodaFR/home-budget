import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { lifeEvent } from '../test/fixtures';
import { useLifeEventActions } from './use-life-event-actions';

const api = vi.hoisted(() => ({ createLifeEvent: vi.fn(), updateLifeEvent: vi.fn(), deleteLifeEvent: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

describe('useLifeEventActions', () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset().mockResolvedValue(undefined));
    onChanged.mockReset();
  });

  it('creates a birth with the BIRTH type, returns the created event and notifies', async () => {
    api.createLifeEvent.mockResolvedValue(lifeEvent());
    const { result } = renderHook(() => useLifeEventActions(onChanged));
    let created: unknown;
    await act(async () => {
      created = await result.current.createBirth({ eventDate: '2026-11-12', label: 'Bébé' });
    });
    expect(api.createLifeEvent).toHaveBeenCalledWith({ type: 'BIRTH', eventDate: '2026-11-12', label: 'Bébé' });
    expect(created).toEqual(lifeEvent());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('creates a birth without a label', async () => {
    const { result } = renderHook(() => useLifeEventActions(onChanged));
    await act(() => result.current.createBirth({ eventDate: '2026-11-12' }));
    expect(api.createLifeEvent).toHaveBeenCalledWith({ type: 'BIRTH', eventDate: '2026-11-12' });
  });

  it('updates and deletes by event id', async () => {
    const { result } = renderHook(() => useLifeEventActions(onChanged));
    await act(() => result.current.update(lifeEvent(), { eventDate: '2026-11-20', label: 'Bébé' }));
    expect(api.updateLifeEvent).toHaveBeenCalledWith('e1', { eventDate: '2026-11-20', label: 'Bébé' });
    await act(() => result.current.remove(lifeEvent()));
    expect(api.deleteLifeEvent).toHaveBeenCalledWith('e1');
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('does not notify and frees the busy flag when the server refuses', async () => {
    api.createLifeEvent.mockRejectedValue(new ApiError(400, 'date invalide'));
    const { result } = renderHook(() => useLifeEventActions(onChanged));
    await act(async () => {
      await expect(result.current.createBirth({ eventDate: '1990-01-01' })).rejects.toBeInstanceOf(ApiError);
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});
