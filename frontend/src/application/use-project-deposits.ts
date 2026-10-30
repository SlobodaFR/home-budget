import { useCallback, useState } from 'react';
import { Deposit, DepositPayload } from '../domain/project';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

export interface ProjectDeposits {
  deposits: Resource<Deposit[]>;
  busy: boolean;
  add: (payload: DepositPayload) => Promise<void>;
  remove: (depositId: string) => Promise<void>;
}

/** Les versements d'un projet. Après un ajout ou une suppression, la liste est rechargée et `onChanged` met à jour les totaux du projet. */
export function useProjectDeposits(spaceId: string, projectId: string, onChanged: () => void): ProjectDeposits {
  const deposits = useResource(async () => apiClient.fetchDeposits(spaceId, projectId), [spaceId, projectId]);
  const { reload } = deposits;
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        reload();
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [reload, onChanged],
  );

  const add = useCallback((payload: DepositPayload) => run(() => apiClient.createDeposit(spaceId, projectId, payload)), [run, spaceId, projectId]);
  const remove = useCallback((depositId: string) => run(() => apiClient.deleteDeposit(spaceId, projectId, depositId)), [run, spaceId, projectId]);

  return { deposits, busy, add, remove };
}
