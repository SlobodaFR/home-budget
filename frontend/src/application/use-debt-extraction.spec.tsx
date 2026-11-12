import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseExtractionJob } from '../domain/debt-extraction';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { rawExtractionJob, rawExtractionResult } from '../test/fixtures';

const api = vi.hoisted(() => ({
  fetchDebtExtractionCapabilities: vi.fn<ApiMock<'fetchDebtExtractionCapabilities'>>(),
  startDebtExtraction: vi.fn<ApiMock<'startDebtExtraction'>>(),
  fetchDebtExtraction: vi.fn<ApiMock<'fetchDebtExtraction'>>(),
  deleteDebtExtraction: vi.fn<ApiMock<'deleteDebtExtraction'>>(),
}));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

import { useDebtExtraction, useExtractionCapabilities } from './use-debt-extraction';
import type { ApiMock } from '../test/api-mock';

const file = new File(['%PDF-1.4'], 'contrat.pdf', { type: 'application/pdf' });
const job = (raw: Record<string, unknown>) => {
  const parsed = parseExtractionJob(raw);
  if (!parsed) {
    throw new Error('job illisible');
  }
  return parsed;
};
const running = (progressPercent = 40, stage = 'OCR') => job(rawExtractionJob({ progressPercent, stage }));
const done = () => job({ status: 'DONE', stage: null, progressPercent: 100, result: rawExtractionResult() });

/** Laisse passer le temps simulé et les promesses en attente. */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useExtractionCapabilities', () => {
  beforeEach(() => {
    api.fetchDebtExtractionCapabilities.mockReset();
  });

  it('gives the capabilities when the server can read contracts', async () => {
    api.fetchDebtExtractionCapabilities.mockResolvedValue({ available: true, maxFileBytes: 1000, maxPages: 40 });
    const { result } = renderHook(() => useExtractionCapabilities(true));
    await waitFor(() => expect(result.current).toEqual({ available: true, maxFileBytes: 1000, maxPages: 40 }));
  });

  it('stays hidden when the tools are missing', async () => {
    api.fetchDebtExtractionCapabilities.mockResolvedValue({ available: false, maxFileBytes: 1000, maxPages: null });
    const { result } = renderHook(() => useExtractionCapabilities(true));
    await waitFor(() => expect(api.fetchDebtExtractionCapabilities).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('stays hidden on a network error or an unreadable answer', async () => {
    api.fetchDebtExtractionCapabilities.mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useExtractionCapabilities(true));
    await waitFor(() => expect(api.fetchDebtExtractionCapabilities).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('stays hidden when the client has no such call at all', async () => {
    const original = api.fetchDebtExtractionCapabilities;
    (api as Record<string, unknown>).fetchDebtExtractionCapabilities = undefined;
    const { result } = renderHook(() => useExtractionCapabilities(true));
    await act(async () => undefined);
    expect(result.current).toBeNull();
    api.fetchDebtExtractionCapabilities = original;
  });

  it('asks nothing when disabled (editing an existing credit)', async () => {
    const { result } = renderHook(() => useExtractionCapabilities(false));
    await act(async () => undefined);
    expect(api.fetchDebtExtractionCapabilities).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });
});

describe('useDebtExtraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.startDebtExtraction.mockReset().mockResolvedValue({ jobId: 'job-1', expiresAtMs: null });
    api.fetchDebtExtraction.mockReset().mockResolvedValue(running());
    api.deleteDebtExtraction.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => renderHook(() => useDebtExtraction('s1', 5000));
  const begin = async (hook: ReturnType<typeof setup>) => {
    act(() => hook.result.current.start(file));
    await tick(0);
  };

  it('sends the file then follows the job from 1.5 s, with a growing delay', async () => {
    const hook = setup();
    expect(hook.result.current.state).toEqual({ phase: 'idle' });
    act(() => hook.result.current.start(file));
    expect(hook.result.current.state).toEqual({ phase: 'uploading' });
    await tick(0);
    expect(api.startDebtExtraction).toHaveBeenCalledWith('s1', file);
    expect(hook.result.current.state).toMatchObject({ phase: 'running', status: 'PENDING', progressPercent: 0 });

    await tick(1499);
    expect(api.fetchDebtExtraction).not.toHaveBeenCalled();
    await tick(1);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(1);
    expect(api.fetchDebtExtraction).toHaveBeenCalledWith('job-1');
    expect(hook.result.current.state).toMatchObject({ phase: 'running', status: 'RUNNING', stage: 'OCR', progressPercent: 40, connectionLost: false });

    // 4 interrogations de plus toutes les 1,5 s, puis l'intervalle grandit sans dépasser 4 s.
    await tick(1500 * 4);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(5);
    await tick(1999);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(5);
    await tick(1);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(6);
    await tick(30_000);
    const calls = api.fetchDebtExtraction.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(6 + Math.ceil(30_000 / 2500) + 1);
    expect(calls).toBeGreaterThan(6 + 7);
  });

  it('shows the stage and progress as they change, then the result, and deletes nothing yet', async () => {
    api.fetchDebtExtraction.mockResolvedValueOnce(running(20, 'TEXT')).mockResolvedValueOnce(running(70, 'PARSING')).mockResolvedValue(done());
    const hook = setup();
    await begin(hook);
    await tick(1500);
    expect(hook.result.current.state).toMatchObject({ phase: 'running', stage: 'TEXT', progressPercent: 20 });
    await tick(1500);
    expect(hook.result.current.state).toMatchObject({ phase: 'running', stage: 'PARSING', progressPercent: 70 });
    await tick(1500);
    expect(hook.result.current.state.phase).toBe('review');
    const state = hook.result.current.state;
    expect(state.phase === 'review' && state.result.fields).toHaveLength(5);
    expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
    // Plus de suivi une fois le résultat reçu.
    expect(vi.getTimerCount()).toBe(0);
    const polls = api.fetchDebtExtraction.mock.calls.length;
    await tick(20_000);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(polls);
  });

  it('deletes the result on the server, once, when it is released', async () => {
    api.fetchDebtExtraction.mockResolvedValue(done());
    const hook = setup();
    await begin(hook);
    await tick(1500);
    expect(hook.result.current.state.phase).toBe('review');
    act(() => hook.result.current.release());
    expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
    expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
    expect(hook.result.current.state).toEqual({ phase: 'idle' });
    hook.unmount();
    expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
  });

  it('stops following and deletes the job when cancelled while running', async () => {
    const hook = setup();
    await begin(hook);
    await tick(1500);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.cancel());
    expect(hook.result.current.state).toEqual({ phase: 'idle' });
    expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
    expect(vi.getTimerCount()).toBe(0);
    await tick(30_000);
    expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(1);
    expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer that arrives after the cancellation', async () => {
    let answer: (value: unknown) => void = () => undefined;
    api.fetchDebtExtraction.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const hook = setup();
    await begin(hook);
    await tick(1500);
    act(() => hook.result.current.cancel());
    await act(async () => answer(done()));
    expect(hook.result.current.state).toEqual({ phase: 'idle' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('deletes the job as soon as it exists when cancelled during the upload', async () => {
    let finishUpload: (value: unknown) => void = () => undefined;
    api.startDebtExtraction.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    const hook = setup();
    act(() => hook.result.current.start(file));
    act(() => hook.result.current.cancel());
    expect(hook.result.current.state).toEqual({ phase: 'idle' });
    expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
    await act(async () => finishUpload({ jobId: 'late', expiresAtMs: null }));
    expect(api.deleteDebtExtraction).toHaveBeenCalledWith('late');
    expect(vi.getTimerCount()).toBe(0);
    await tick(10_000);
    expect(api.fetchDebtExtraction).not.toHaveBeenCalled();
  });

  it('does not send the same file twice when started twice', async () => {
    const hook = setup();
    act(() => {
      hook.result.current.start(file);
      hook.result.current.start(file);
    });
    await tick(0);
    expect(api.startDebtExtraction).toHaveBeenCalledTimes(1);
  });

  describe('refusals when sending', () => {
    it.each([
      [429, 'Une lecture est déjà en cours ou vous en avez fait trop cette heure'],
      [503, 'pas disponible'],
      [400, 'moins de 5 Ko'],
      [500, 'La lecture du contrat a échoué'],
    ])('explains a %i', async (status, text) => {
      api.startDebtExtraction.mockRejectedValue(new ApiError(status, 'non'));
      const hook = setup();
      await begin(hook);
      const state = hook.result.current.state;
      expect(state.phase).toBe('error');
      expect(state.phase === 'error' && state.message).toContain(text);
      expect(state.phase === 'error' && state.canResume).toBe(false);
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('explains a network error and lets the person try again', async () => {
      api.startDebtExtraction.mockRejectedValue(new NetworkError());
      const hook = setup();
      await begin(hook);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('Pas de connexion') });
      api.startDebtExtraction.mockResolvedValue({ jobId: 'job-2', expiresAtMs: null });
      act(() => hook.result.current.cancel());
      await begin(hook);
      expect(hook.result.current.state.phase).toBe('running');
    });
  });

  describe('failures while following', () => {
    it('shows the message of a failed job and deletes it', async () => {
      api.fetchDebtExtraction.mockResolvedValue(job({ status: 'FAILED', error: { message: 'Le PDF est protégé par un mot de passe.' } }));
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(hook.result.current.state).toEqual({ phase: 'error', message: 'Le PDF est protégé par un mot de passe.', canResume: false });
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('uses a generic message when a failed job explains nothing', async () => {
      api.fetchDebtExtraction.mockResolvedValue(job({ status: 'FAILED' }));
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('a échoué') });
    });

    it('says the result expired on a 404, without trying to delete it', async () => {
      api.fetchDebtExtraction.mockRejectedValue(new ApiError(404, 'introuvable'));
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('n’est plus disponible'), canResume: false });
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      hook.unmount();
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
    });

    it('stops at the expiry date announced by the server and deletes the job', async () => {
      api.startDebtExtraction.mockResolvedValue({ jobId: 'job-1', expiresAtMs: Date.now() + 5000 });
      const hook = setup();
      await begin(hook);
      await tick(1500 * 5);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('n’est plus disponible') });
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does not follow forever when the server never finishes', async () => {
      const hook = setup();
      await begin(hook);
      await tick(11 * 60 * 1000);
      expect(hook.result.current.state.phase).toBe('error');
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('treats a finished job without a readable result as a failure and deletes it', async () => {
      api.fetchDebtExtraction.mockResolvedValue(job({ status: 'DONE', result: 'oups' }));
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('rien donné d’exploitable') });
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
    });

    it('keeps trying through a short network loss and says so', async () => {
      api.fetchDebtExtraction.mockResolvedValueOnce(running(10)).mockRejectedValueOnce(new NetworkError()).mockRejectedValueOnce(new NetworkError()).mockResolvedValue(done());
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(hook.result.current.state).toMatchObject({ phase: 'running', connectionLost: false });
      await tick(1500);
      expect(hook.result.current.state).toMatchObject({ phase: 'running', connectionLost: true });
      await tick(10_000);
      expect(hook.result.current.state.phase).toBe('review');
    });

    it('gives up after several network failures, then resumes on request', async () => {
      api.fetchDebtExtraction.mockRejectedValue(new NetworkError());
      const hook = setup();
      await begin(hook);
      await tick(60_000);
      expect(hook.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('Pas de connexion'), canResume: true });
      expect(vi.getTimerCount()).toBe(0);
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();

      api.fetchDebtExtraction.mockResolvedValue(done());
      act(() => hook.result.current.resume());
      await tick(0);
      expect(hook.result.current.state.phase).toBe('review');
    });

    it('deletes the job when the person abandons after a network loss', async () => {
      api.fetchDebtExtraction.mockRejectedValue(new NetworkError());
      const hook = setup();
      await begin(hook);
      await tick(60_000);
      act(() => hook.result.current.cancel());
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      expect(hook.result.current.state).toEqual({ phase: 'idle' });
    });
  });

  describe('cleanup', () => {
    it('leaves no timer and deletes the job when unmounted while running', async () => {
      const hook = setup();
      await begin(hook);
      await tick(1500);
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      hook.unmount();
      expect(vi.getTimerCount()).toBe(0);
      expect(api.deleteDebtExtraction).toHaveBeenCalledTimes(1);
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
      await tick(60_000);
      expect(api.fetchDebtExtraction).toHaveBeenCalledTimes(1);
    });

    it('deletes the result when unmounted on the review screen', async () => {
      api.fetchDebtExtraction.mockResolvedValue(done());
      const hook = setup();
      await begin(hook);
      await tick(1500);
      hook.unmount();
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('job-1');
    });

    it('deletes the job that comes back after an unmount during the upload', async () => {
      let finishUpload: (value: unknown) => void = () => undefined;
      api.startDebtExtraction.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
      const hook = setup();
      act(() => hook.result.current.start(file));
      hook.unmount();
      await act(async () => finishUpload({ jobId: 'late', expiresAtMs: null }));
      expect(api.deleteDebtExtraction).toHaveBeenCalledWith('late');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('does nothing when unmounted before any start', () => {
      const hook = setup();
      hook.unmount();
      expect(api.deleteDebtExtraction).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('survives a delete that fails or a client without that call', async () => {
      api.deleteDebtExtraction.mockRejectedValue(new ApiError(500, 'boum'));
      const hook = setup();
      await begin(hook);
      act(() => hook.result.current.cancel());
      await tick(0);
      expect(hook.result.current.state).toEqual({ phase: 'idle' });
      const original = api.deleteDebtExtraction;
      (api as Record<string, unknown>).deleteDebtExtraction = undefined;
      const second = setup();
      await begin(second);
      expect(() => second.unmount()).not.toThrow();
      api.deleteDebtExtraction = original;
    });
  });
});
