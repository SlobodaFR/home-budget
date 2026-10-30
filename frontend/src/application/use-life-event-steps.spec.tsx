import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifeEvent } from '../domain/life-event';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { lifeEvent } from '../test/fixtures';
import { useLifeEventSteps } from './use-life-event-steps';

const api = vi.hoisted(() => ({ setLifeEventStep: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const NOW = new Date(2026, 9, 30, 12, 0, 0);
const now = () => NOW;
const source: LifeEvent[] = [lifeEvent()];
const stepOf = (events: LifeEvent[] | undefined, stepId: string) => events?.[0].steps.find((step) => step.stepId === stepId);

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useLifeEventSteps', () => {
  const onSettled = vi.fn();

  beforeEach(() => {
    api.setLifeEventStep.mockReset().mockResolvedValue(undefined);
    onSettled.mockReset();
  });

  it('exposes the events it is given', async () => {
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBe(source));
  });

  it('ticks at once, before the server answers, then asks for a refresh', async () => {
    const pending = deferred();
    api.setLifeEventStep.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());

    let done!: Promise<void>;
    act(() => {
      done = result.current.toggle('e1', 'birth-declaration', true);
    });
    expect(stepOf(result.current.events, 'birth-declaration')).toMatchObject({ status: 'DONE', doneAt: NOW.toISOString() });
    expect(result.current.events?.[0]).toMatchObject({ doneCount: 2, progressPercent: 40 });
    expect(result.current.isSaving('e1', 'birth-declaration')).toBe(true);
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
      await done;
    });
    expect(api.setLifeEventStep).toHaveBeenCalledWith('e1', 'birth-declaration', { done: true });
    expect(result.current.isSaving('e1', 'birth-declaration')).toBe(false);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('puts the step back and rethrows when the server refuses, without refreshing', async () => {
    api.setLifeEventStep.mockRejectedValue(new ApiError(500, 'Boom'));
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    await act(async () => {
      await expect(result.current.toggle('e1', 'birth-declaration', true)).rejects.toBeInstanceOf(ApiError);
    });
    expect(stepOf(result.current.events, 'birth-declaration')).toMatchObject({ status: 'DUE_SOON', doneAt: null });
    expect(result.current.events?.[0].doneCount).toBe(1);
    expect(result.current.isSaving('e1', 'birth-declaration')).toBe(false);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('rolls back an unticking when offline', async () => {
    api.setLifeEventStep.mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    await act(async () => {
      await expect(result.current.toggle('e1', 'birth-family-booklet', false)).rejects.toBeInstanceOf(NetworkError);
    });
    expect(stepOf(result.current.events, 'birth-family-booklet')).toMatchObject({ status: 'DONE', doneAt: '2026-10-28T09:00:00.000Z', note: 'Récupéré à la mairie' });
  });

  it('ignores a second click on a step that is still being saved', async () => {
    const pending = deferred();
    api.setLifeEventStep.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    let first!: Promise<void>;
    act(() => {
      first = result.current.toggle('e1', 'birth-declaration', true);
    });
    await act(async () => {
      await result.current.toggle('e1', 'birth-declaration', false);
    });
    expect(api.setLifeEventStep).toHaveBeenCalledTimes(1);
    expect(stepOf(result.current.events, 'birth-declaration')?.status).toBe('DONE');
    await act(async () => {
      pending.resolve();
      await first;
    });
  });

  it('refreshes once, when the last of several requests is over, and does not let a reload overwrite a tick in flight', async () => {
    const a = deferred();
    const b = deferred();
    api.setLifeEventStep.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result, rerender } = renderHook(({ events }) => useLifeEventSteps(events, onSettled, now), { initialProps: { events: source } });
    await waitFor(() => expect(result.current.events).toBeDefined());
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggle('e1', 'birth-declaration', true);
      second = result.current.toggle('e1', 'birth-caf-declaration', true);
    });
    rerender({ events: [lifeEvent()] });
    expect(stepOf(result.current.events, 'birth-declaration')?.status).toBe('DONE');

    await act(async () => {
      a.resolve();
      await first;
    });
    expect(onSettled).not.toHaveBeenCalled();
    await act(async () => {
      b.resolve();
      await second;
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('follows the server again once nothing is in flight', async () => {
    const { result, rerender } = renderHook(({ events }) => useLifeEventSteps(events, onSettled, now), { initialProps: { events: source } });
    await waitFor(() => expect(result.current.events).toBe(source));
    const reloaded = [lifeEvent({ label: 'Bébé' })];
    rerender({ events: reloaded });
    await waitFor(() => expect(result.current.events).toBe(reloaded));
  });

  it('saves a note with the current done state, shows it, and keeps the step where it was', async () => {
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    await act(() => result.current.saveNote('e1', 'birth-family-booklet', 'Nouvelle note'));
    expect(api.setLifeEventStep).toHaveBeenCalledWith('e1', 'birth-family-booklet', { done: true, note: 'Nouvelle note' });
    expect(stepOf(result.current.events, 'birth-family-booklet')).toMatchObject({ note: 'Nouvelle note', status: 'DONE' });
    await act(() => result.current.saveNote('e1', 'birth-declaration', 'RDV lundi'));
    expect(api.setLifeEventStep).toHaveBeenLastCalledWith('e1', 'birth-declaration', { done: false, note: 'RDV lundi' });
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it('does not touch the note shown when saving it fails', async () => {
    api.setLifeEventStep.mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    await act(async () => {
      await expect(result.current.saveNote('e1', 'birth-family-booklet', 'Perdue ?')).rejects.toBeInstanceOf(NetworkError);
    });
    expect(stepOf(result.current.events, 'birth-family-booklet')?.note).toBe('Récupéré à la mairie');
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('adds a freshly created event at its place, newest first', async () => {
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    act(() => result.current.add(lifeEvent({ id: 'e2', eventDate: '2027-01-15' })));
    expect(result.current.events?.map((event) => event.id)).toEqual(['e2', 'e1']);
    act(() => result.current.add(lifeEvent({ id: 'e2', eventDate: '2027-01-15', label: 'Remplacé' })));
    expect(result.current.events).toHaveLength(2);
  });

  it('ignores an unknown step', async () => {
    const { result } = renderHook(() => useLifeEventSteps(source, onSettled, now));
    await waitFor(() => expect(result.current.events).toBeDefined());
    await act(() => result.current.toggle('e1', 'inconnue', true));
    expect(api.setLifeEventStep).not.toHaveBeenCalled();
  });
});
