import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { describeReviewSaveError, useReview, useReviewActions, useReviewHistory } from './use-review';

const api = vi.hoisted(() => ({ fetchReview: vi.fn(), fetchReviews: vi.fn(), saveReview: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const review = { month: '2026-10', status: 'TODO', answers: { wentWell: '', surprise: '', decision: '' }, completedAt: null, snapshot: {} };

describe('review hooks', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchReview.mockResolvedValue(review);
    api.fetchReviews.mockResolvedValue([]);
    api.saveReview.mockResolvedValue(undefined);
  });

  it('loads the review of a month of the space', async () => {
    const { result } = renderHook(() => useReview('s-common', '2026-10'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(review));
    expect(api.fetchReview).toHaveBeenCalledWith('s-common', '2026-10');
  });

  it('does nothing while no month is chosen', async () => {
    const { result } = renderHook(() => useReview('s-common', null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(api.fetchReview).not.toHaveBeenCalled();
  });

  it('reloads when the month, the space or the token changes', async () => {
    const { result, rerender } = renderHook(({ id, month, token }) => useReview(id, month, token), { initialProps: { id: 's-common', month: '2026-10', token: 0 } });
    await waitFor(() => expect(result.current.data).toBeDefined());
    rerender({ id: 's-common', month: '2026-09', token: 0 });
    await waitFor(() => expect(api.fetchReview).toHaveBeenLastCalledWith('s-common', '2026-09'));
    rerender({ id: 's-alice', month: '2026-09', token: 0 });
    await waitFor(() => expect(api.fetchReview).toHaveBeenLastCalledWith('s-alice', '2026-09'));
    rerender({ id: 's-alice', month: '2026-09', token: 1 });
    await waitFor(() => expect(api.fetchReview).toHaveBeenCalledTimes(4));
  });

  it('turns a failing or missing client method into an error state, never a crash', async () => {
    api.fetchReview.mockRejectedValue(new ApiError(500, 'boom'));
    const { result } = renderHook(() => useReview('s-common', '2026-10'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    const original = api.fetchReviews;
    api.fetchReviews = undefined as never;
    const missing = renderHook(() => useReviewHistory('s-common'));
    await waitFor(() => expect(missing.result.current.error).toBeInstanceOf(TypeError));
    api.fetchReviews = original;
  });

  it('loads the history of the space', async () => {
    api.fetchReviews.mockResolvedValue([{ month: '2026-09', status: 'DONE', decision: 'x', completedAt: null }]);
    const { result } = renderHook(() => useReviewHistory('s-common'));
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(api.fetchReviews).toHaveBeenCalledWith('s-common');
  });

  it('saves then tells the page to refresh', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useReviewActions('s-common', '2026-10', onSaved));
    const payload = { answers: { wentWell: '', surprise: '', decision: 'Une liste' }, complete: true };
    await act(async () => {
      await result.current.save(payload);
    });
    expect(api.saveReview).toHaveBeenCalledWith('s-common', '2026-10', payload);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('rejects and does not refresh when saving fails', async () => {
    api.saveReview.mockRejectedValue(new NetworkError());
    const onSaved = vi.fn();
    const { result } = renderHook(() => useReviewActions('s-common', '2026-10', onSaved));
    await act(async () => {
      await expect(result.current.save({ answers: { wentWell: '', surprise: '', decision: '' }, complete: false })).rejects.toBeInstanceOf(NetworkError);
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});

describe('describeReviewSaveError', () => {
  it('always reassures that the text is kept, and explains offline, expired session and refusal', () => {
    expect(describeReviewSaveError(new NetworkError())).toMatch(/Pas de connexion .* texte est conservé/);
    expect(describeReviewSaveError(new ApiError(401, ''))).toMatch(/session a expiré/);
    expect(describeReviewSaveError(new ApiError(400, ''))).toMatch(/500 caractères/);
    expect(describeReviewSaveError(new ApiError(500, ''))).toMatch(/texte est conservé/);
  });
});
