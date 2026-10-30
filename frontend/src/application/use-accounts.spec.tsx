import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from './use-household';
import { OfflineQueueProvider } from './use-offline-queue';
import { SpaceProvider } from './use-space';
import { AccountsProvider, AccountsValue, useAccounts } from './use-accounts';
import { preferences } from '../infrastructure/local-store';
import { ApiError } from '../infrastructure/api-client';
import { account } from '../test/fixtures';
import { testHousehold } from '../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn(), createTransaction: vi.fn() }));

vi.mock('../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../presentation/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

let latest: AccountsValue;

function Probe() {
  latest = useAccounts();
  return <p data-testid="names">{latest.accounts.map((item) => item.name).join(',')}</p>;
}

function renderProvider() {
  const value: HouseholdContextValue = { household: testHousehold, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter>
      <HouseholdContext.Provider value={value}>
        <SpaceProvider>
          <OfflineQueueProvider>
            <AccountsProvider>
              <Probe />
            </AccountsProvider>
          </OfflineQueueProvider>
        </SpaceProvider>
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
}

describe('AccountsProvider', () => {
  beforeEach(() => {
    api.fetchAccounts.mockReset();
    api.fetchAccounts.mockResolvedValue([account({ id: 'a1', name: 'Courant' }), account({ id: 'a2', name: 'Livret', archived: true })]);
  });

  it('loads the accounts of the selected space', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Courant,Livret'));
    expect(api.fetchAccounts).toHaveBeenCalledWith('s-common');
    expect(latest.hasSelectableAccount).toBe(true);
    expect(latest.nameOf('a1')).toBe('Courant');
    expect(latest.nameOf('nope')).toBeNull();
  });

  it('loads the personal space accounts when that space is selected', async () => {
    preferences.setSpaceKind('PERSONAL');
    renderProvider();
    await waitFor(() => expect(api.fetchAccounts).toHaveBeenCalledWith('s-alice'));
  });

  it('has no selectable account when all are archived', async () => {
    api.fetchAccounts.mockResolvedValue([account({ archived: true })]);
    renderProvider();
    await waitFor(() => expect(latest.loaded).toBe(true));
    await waitFor(() => expect(screen.getByTestId('names')).toHaveTextContent('Compte commun'));
    expect(latest.hasSelectableAccount).toBe(false);
  });

  it('remembers the last account per space', async () => {
    renderProvider();
    await waitFor(() => expect(latest.accounts).toHaveLength(2));
    expect(latest.defaultAccountId()).toBeNull();
    act(() => latest.rememberAccount('a1'));
    expect(latest.defaultAccountId()).toBe('a1');
    expect(preferences.getLastAccountId('s-common')).toBe('a1');
    expect(preferences.getLastAccountId('s-alice')).toBeNull();
    act(() => latest.rememberAccount(null));
    expect(latest.defaultAccountId()).toBeNull();
    expect(preferences.getLastAccountId('s-common')).toBeNull();
  });

  it('forgets a remembered account that was archived or deleted', async () => {
    preferences.setLastAccountId('s-common', 'a2');
    renderProvider();
    await waitFor(() => expect(latest.accounts).toHaveLength(2));
    expect(latest.defaultAccountId()).toBeNull();
    preferences.setLastAccountId('s-common', 'gone');
    expect(latest.defaultAccountId()).toBeNull();
  });

  it('behaves as « no account » when the endpoint fails', async () => {
    api.fetchAccounts.mockRejectedValue(new ApiError(404, 'nope'));
    renderProvider();
    await waitFor(() => expect(latest.error).toBeInstanceOf(ApiError));
    expect(latest.accounts).toEqual([]);
    expect(latest.hasSelectableAccount).toBe(false);
    expect(latest.defaultAccountId()).toBeNull();
  });
});

describe('useAccounts without provider', () => {
  it('defaults to no accounts, so isolated components keep working', () => {
    render(<Probe />);
    expect(latest.accounts).toEqual([]);
    expect(latest.hasSelectableAccount).toBe(false);
  });
});
