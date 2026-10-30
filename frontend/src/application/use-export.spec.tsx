import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../infrastructure/api-client';
import { describeExportError, useExport } from './use-export';

const api = vi.hoisted(() => ({ downloadExport: vi.fn(), downloadTransactionsCsv: vi.fn() }));
const files = vi.hoisted(() => ({ saveFile: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));
vi.mock('../infrastructure/browser-download', () => files);

const blob = new Blob(['x']);

describe('useExport', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    files.saveFile.mockReset();
    api.downloadExport.mockResolvedValue({ blob, filename: 'budget-export-2026-10-29.json' });
    api.downloadTransactionsCsv.mockResolvedValue({ blob, filename: 'operations-2026-01-01_2026-10-30.csv' });
  });

  it('downloads the backup, hands the file to the browser and returns its name', async () => {
    const { result } = renderHook(() => useExport());
    let name = '';
    await act(async () => {
      name = await result.current.downloadBackup();
    });
    expect(name).toBe('budget-export-2026-10-29.json');
    expect(files.saveFile).toHaveBeenCalledWith({ blob, filename: 'budget-export-2026-10-29.json' });
    expect(result.current.busy).toBeNull();
  });

  it('downloads the CSV of the chosen space and period', async () => {
    const { result } = renderHook(() => useExport());
    await act(async () => {
      await result.current.downloadCsv('s-alice', { from: '2026-01-01', to: '2026-10-30' });
    });
    expect(api.downloadTransactionsCsv).toHaveBeenCalledWith('s-alice', { from: '2026-01-01', to: '2026-10-30' });
    expect(files.saveFile).toHaveBeenCalledTimes(1);
  });

  it('shows which export is running', async () => {
    let release: (value: unknown) => void = () => undefined;
    api.downloadExport.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useExport());
    let pending: Promise<string> = Promise.resolve('');
    act(() => {
      pending = result.current.downloadBackup();
    });
    expect(result.current.busy).toBe('backup');
    await act(async () => {
      release({ blob, filename: 'f.json' });
      await pending;
    });
    expect(result.current.busy).toBeNull();
  });

  it('rethrows a failure without saving anything, and is free again', async () => {
    api.downloadExport.mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useExport());
    await act(async () => {
      await expect(result.current.downloadBackup()).rejects.toBeInstanceOf(NetworkError);
    });
    expect(files.saveFile).not.toHaveBeenCalled();
    expect(result.current.busy).toBeNull();
  });
});

describe('describeExportError', () => {
  it('explains each failure in plain French', () => {
    expect(describeExportError(new NetworkError())).toMatch(/Pas de connexion/);
    expect(describeExportError(new ApiError(404, ''))).toMatch(/Aucun foyer/);
    expect(describeExportError(new ApiError(401, ''))).toMatch(/session a expiré/);
    expect(describeExportError(new ApiError(400, ''))).toMatch(/366 jours/);
    expect(describeExportError(new ApiError(500, ''))).toMatch(/a échoué/);
    expect(describeExportError(new Error('?'))).toMatch(/a échoué/);
  });
});
