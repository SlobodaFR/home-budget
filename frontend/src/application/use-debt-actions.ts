import { useCallback, useState } from 'react';
import { Debt, DebtPayload, debtToPayload } from '../domain/debt';
import { apiClient } from '../infrastructure/api-client';

/** Création, modification, archivage et suppression des crédits ; `onChanged` recharge la liste et le bandeau de synthèse. */
export function useDebtActions(spaceId: string, onChanged: () => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const create = useCallback((payload: DebtPayload) => run(() => apiClient.createDebt(spaceId, payload)), [run, spaceId]);
  const update = useCallback(
    (debt: Debt, payload: DebtPayload) => run(() => apiClient.updateDebt(spaceId, debt.id, { ...payload, archived: debt.archived })),
    [run, spaceId],
  );
  const setArchived = useCallback(
    (debt: Debt, archived: boolean) => run(() => apiClient.updateDebt(spaceId, debt.id, debtToPayload(debt, { archived }))),
    [run, spaceId],
  );
  const remove = useCallback((debt: Debt) => run(() => apiClient.deleteDebt(spaceId, debt.id)), [run, spaceId]);

  return { busy, create, update, setArchived, remove };
}
