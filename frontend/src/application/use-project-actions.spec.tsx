import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../infrastructure/api-client';
import { project } from '../test/fixtures';
import { useProjectActions } from './use-project-actions';

const api = vi.hoisted(() => ({ createProject: vi.fn(), updateProject: vi.fn(), deleteProject: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

const payload = { name: 'Voiture', kind: 'PURCHASE' as const, targetCents: 800000, targetDate: '2028-04-30', startCents: 0, startDate: '2026-10-30' };

describe('useProjectActions', () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset().mockResolvedValue(undefined));
    onChanged.mockReset();
  });

  it('creates a project and notifies', async () => {
    const { result } = renderHook(() => useProjectActions('s-common', onChanged));
    await act(() => result.current.create(payload));
    expect(api.createProject).toHaveBeenCalledWith('s-common', payload);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
  });

  it('keeps the archived flag when editing', async () => {
    const { result } = renderHook(() => useProjectActions('s-common', onChanged));
    await act(() => result.current.update(project({ archived: true }), payload));
    expect(api.updateProject).toHaveBeenCalledWith('s-common', 'p1', { ...payload, archived: true });
  });

  it('archives with the full payload, account included', async () => {
    const { result } = renderHook(() => useProjectActions('s-common', onChanged));
    await act(() => result.current.setArchived(project({ accountId: 'a1' }), true));
    expect(api.updateProject).toHaveBeenCalledWith('s-common', 'p1', {
      name: 'Vacances été 2027',
      kind: 'HOLIDAY',
      targetCents: 300000,
      targetDate: '2027-07-01',
      startCents: 0,
      startDate: '2026-11-01',
      accountId: 'a1',
      archived: true,
    });
  });

  it('deletes a project', async () => {
    const { result } = renderHook(() => useProjectActions('s-common', onChanged));
    await act(() => result.current.remove(project()));
    expect(api.deleteProject).toHaveBeenCalledWith('s-common', 'p1');
    expect(onChanged).toHaveBeenCalled();
  });

  it('does not notify and frees the busy flag when the server refuses', async () => {
    api.createProject.mockRejectedValue(new ApiError(400, 'non'));
    const { result } = renderHook(() => useProjectActions('s-common', onChanged));
    await act(async () => {
      await expect(result.current.create(payload)).rejects.toBeInstanceOf(ApiError);
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });
});
