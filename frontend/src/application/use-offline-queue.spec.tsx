import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionPayload } from '../domain/budget';
import { pendingStore } from '../infrastructure/local-store';

const api = vi.hoisted(() => ({ createTransaction: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../presentation/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'a@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { NetworkError } from '../infrastructure/api-client';
import { OfflineQueueProvider, useOfflineQueue } from './use-offline-queue';

const payload: TransactionPayload = {
  kind: 'EXPENSE',
  bloc: 'COURANT',
  label: 'Courses',
  amountCents: 1250,
  date: '2026-10-03T00:00:00.000Z',
};

function Probe() {
  const { pending, submit } = useOfflineQueue();
  return (
    <div>
      <span data-testid="count">{pending.length}</span>
      <button type="button" onClick={() => void submit('space-1', payload)}>
        envoyer
      </button>
    </div>
  );
}

function renderProbe() {
  render(
    <OfflineQueueProvider>
      <Probe />
    </OfflineQueueProvider>,
  );
  return userEvent.setup();
}

describe('OfflineQueueProvider', () => {
  beforeEach(() => {
    api.createTransaction.mockReset();
  });

  it('sends directly when the network is available', async () => {
    api.createTransaction.mockResolvedValue({ id: 't1' });
    const user = renderProbe();
    await user.click(screen.getByText('envoyer'));
    expect(api.createTransaction).toHaveBeenCalledWith('space-1', payload);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('keeps an operation sent offline and replays it once on reconnection', async () => {
    api.createTransaction.mockRejectedValueOnce(new NetworkError()).mockResolvedValue({ id: 't1' });
    const user = renderProbe();
    await user.click(screen.getByText('envoyer'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(pendingStore.load('alice')).toHaveLength(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
    expect(api.createTransaction).toHaveBeenCalledTimes(2);
    expect(pendingStore.load('alice')).toHaveLength(0);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(api.createTransaction).toHaveBeenCalledTimes(2);
  });

  it('replays the persisted queue at startup', async () => {
    pendingStore.add('alice', { clientId: 'c1', spaceId: 'space-1', payload, queuedAt: '2026-10-03T10:00:00.000Z' });
    api.createTransaction.mockResolvedValue({ id: 't1' });
    renderProbe();
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pendingStore.load('alice')).toHaveLength(0));
  });

  it('keeps the queue while the network is still down', async () => {
    pendingStore.add('alice', { clientId: 'c1', spaceId: 'space-1', payload, queuedAt: '2026-10-03T10:00:00.000Z' });
    api.createTransaction.mockRejectedValue(new NetworkError());
    renderProbe();
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(pendingStore.load('alice')).toHaveLength(1);
  });
});
