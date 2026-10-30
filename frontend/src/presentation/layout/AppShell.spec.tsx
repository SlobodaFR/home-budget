import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsProvider } from '../../application/use-accounts';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { OfflineQueueProvider } from '../../application/use-offline-queue';
import { SelectedMonthProvider } from '../../application/use-selected-month';
import { SpaceProvider } from '../../application/use-space';
import { NetworkError } from '../../infrastructure/api-client';
import { pendingStore } from '../../infrastructure/local-store';
import { account } from '../../test/fixtures';
import { testHousehold } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  fetchTransactions: vi.fn(),
  fetchInsights: vi.fn(),
  fetchAccounts: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { HomePage } from '../pages/HomePage';
import { AppShell } from './AppShell';

const summary = {
  month: '2026-11',
  income: { plannedCents: 0, actualCents: 0, gapCents: 0 },
  blocs: ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'].map((bloc) => ({ bloc, plannedCents: 0, actualCents: 0, gapCents: 0 })),
  plannedBalanceCents: 0,
  actualBalanceCents: 0,
  savingsRate: null,
};

function renderShell() {
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter initialEntries={['/']}>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <AccountsProvider>
              <SelectedMonthProvider initialMonth="2026-11">
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<HomePage />} />
                  </Route>
                </Routes>
              </SelectedMonthProvider>
            </AccountsProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Ajouter une opération' }));
  return screen.findByRole('dialog', { name: 'Nouvelle opération' });
};

describe('AppShell quick entry with bank accounts', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchTransactions.mockResolvedValue([]);
    api.fetchInsights.mockResolvedValue([]);
    api.createTransaction.mockResolvedValue({});
    api.fetchAccounts.mockResolvedValue([account({ id: 'a1', name: 'Compte commun' }), account({ id: 'a2', name: 'Livret A' })]);
  });

  it('attaches the operation to the chosen account, then preselects it next time', async () => {
    const user = renderShell();
    await screen.findByRole('region', { name: 'Soldes des comptes' });
    let dialog = await openSheet(user);
    expect(within(dialog).getByLabelText('Compte (facultatif)')).toHaveValue('');
    await user.type(within(dialog).getByLabelText('Montant'), '25');
    await user.selectOptions(within(dialog).getByLabelText('Compte (facultatif)'), 'a2');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('s-common', expect.objectContaining({ amountCents: 2500, accountId: 'a2' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openSheet(user);
    expect(within(dialog).getByLabelText('Compte (facultatif)')).toHaveValue('a2');
  });

  it('keeps the account in the operation queued while offline', async () => {
    api.createTransaction.mockRejectedValue(new NetworkError());
    const user = renderShell();
    await screen.findByRole('region', { name: 'Soldes des comptes' });
    const dialog = await openSheet(user);
    await user.type(within(dialog).getByLabelText('Montant'), '9');
    await user.selectOptions(within(dialog).getByLabelText('Compte (facultatif)'), 'a1');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la dépense' }));
    await waitFor(() => expect(pendingStore.load('alice')).toHaveLength(1));
    expect(pendingStore.load('alice')[0].payload.accountId).toBe('a1');
  });

  it('does not change the remembered account when editing an operation', async () => {
    window.localStorage.setItem('foyer-budget:last-account:s-common', 'a1');
    api.fetchTransactions.mockResolvedValue([
      { id: 't1', spaceId: 's-common', kind: 'EXPENSE', bloc: 'COURANT', label: 'Courses', amountCents: 4200, date: '2026-11-03T00:00:00.000Z', accountId: 'a2' },
    ]);
    api.updateTransaction.mockResolvedValue(undefined);
    const user = renderShell();
    await user.click(await screen.findByRole('button', { name: 'Modifier Courses' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier l’opération' });
    expect(within(dialog).getByLabelText('Compte (facultatif)')).toHaveValue('a2');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('s-common', 't1', expect.objectContaining({ accountId: 'a2' })));
    expect(window.localStorage.getItem('foyer-budget:last-account:s-common')).toBe('a1');
  });

  it('shows no selector in the quick entry when the space has no account', async () => {
    api.fetchAccounts.mockResolvedValue([]);
    const user = renderShell();
    await screen.findByRole('link', { name: 'Mes comptes' });
    const dialog = await openSheet(user);
    expect(within(dialog).queryByLabelText('Compte (facultatif)')).not.toBeInTheDocument();
  });
});
