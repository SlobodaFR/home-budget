import { useCallback, useState } from 'react';
import { Account, AccountPayload, accountToPayload } from '../domain/account';
import { apiClient } from '../infrastructure/api-client';
import { useAccounts } from './use-accounts';

/** Création, modification, archivage et suppression des comptes de l'espace ; la liste est rechargée ensuite. */
export function useAccountActions(spaceId: string) {
  const { reload } = useAccounts();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        reload();
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const create = useCallback((payload: AccountPayload) => run(() => apiClient.createAccount(spaceId, payload)), [run, spaceId]);
  const update = useCallback(
    (account: Account, payload: AccountPayload) => run(() => apiClient.updateAccount(spaceId, account.id, { ...payload, archived: account.archived })),
    [run, spaceId],
  );
  const setArchived = useCallback(
    (account: Account, archived: boolean) => run(() => apiClient.updateAccount(spaceId, account.id, accountToPayload(account, { archived }))),
    [run, spaceId],
  );
  const remove = useCallback((account: Account) => run(() => apiClient.deleteAccount(spaceId, account.id)), [run, spaceId]);

  return { busy, create, update, setArchived, remove };
}
