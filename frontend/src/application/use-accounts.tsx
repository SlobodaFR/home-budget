import { createContext, ReactNode, useCallback, useContext, useMemo } from 'react';
import { Account, accountName as findAccountName, activeAccounts, resolveDefaultAccount } from '../domain/account';
import { apiClient } from '../infrastructure/api-client';
import { preferences } from '../infrastructure/local-store';
import { useOfflineQueue } from './use-offline-queue';
import { useResource } from './use-resource';
import { useSpace } from './use-space';

export interface AccountsValue {
  /** Tous les comptes de l'espace sélectionné (archivés compris) ; vide tant qu'ils chargent ou en cas d'erreur. */
  accounts: Account[];
  loaded: boolean;
  error: unknown;
  reload: () => void;
  /** Le compte à présélectionner dans un nouveau formulaire : le dernier choisi dans l'espace, sinon aucun. */
  defaultAccountId: () => string | null;
  /** Retient le compte choisi pour la prochaine saisie dans cet espace. */
  rememberAccount: (accountId: string | null) => void;
  nameOf: (accountId: string | null | undefined) => string | null;
  /** Au moins un compte non archivé : sinon, aucun sélecteur n'est affiché. */
  hasSelectableAccount: boolean;
}

const NO_ACCOUNTS: Account[] = [];

const AccountsContext = createContext<AccountsValue>({
  accounts: NO_ACCOUNTS,
  loaded: true,
  error: null,
  reload: () => undefined,
  defaultAccountId: () => null,
  rememberAccount: () => undefined,
  nameOf: () => null,
  hasSelectableAccount: false,
});

/** Les comptes de l'espace sélectionné, partagés par l'accueil, les formulaires et la page Comptes. */
export function AccountsProvider({ children }: { children: ReactNode }) {
  const { space } = useSpace();
  const { dataVersion } = useOfflineQueue();
  const resource = useResource(() => apiClient.fetchAccounts(space.id), [space.id], dataVersion);
  const { reload } = resource;
  const accounts = resource.data ?? NO_ACCOUNTS;
  const spaceId = space.id;

  const defaultAccountId = useCallback(
    () => resolveDefaultAccount(accounts, preferences.getLastAccountId(spaceId)),
    [accounts, spaceId],
  );
  const rememberAccount = useCallback((accountId: string | null) => preferences.setLastAccountId(spaceId, accountId), [spaceId]);
  const nameOf = useCallback((accountId: string | null | undefined) => findAccountName(accounts, accountId), [accounts]);

  const value = useMemo<AccountsValue>(
    () => ({
      accounts,
      loaded: !resource.loading || resource.data !== undefined,
      error: resource.error,
      reload,
      defaultAccountId,
      rememberAccount,
      nameOf,
      hasSelectableAccount: activeAccounts(accounts).length > 0,
    }),
    [accounts, resource.loading, resource.data, resource.error, reload, defaultAccountId, rememberAccount, nameOf],
  );
  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts(): AccountsValue {
  return useContext(AccountsContext);
}
