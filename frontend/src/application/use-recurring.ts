import { useCallback, useState } from 'react';
import { RecurringPayload, RecurringPayment, recurringToPayload } from '../domain/recurring';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

export function useRecurring(spaceId: string, onChanged: () => void) {
  const resource = useResource(() => apiClient.fetchRecurring(spaceId), [spaceId]);
  const { reload } = resource;
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setSaving(true);
      try {
        await action();
        reload();
        onChanged();
      } finally {
        setSaving(false);
      }
    },
    [reload, onChanged],
  );

  const create = useCallback(
    (payload: RecurringPayload) => run(() => apiClient.createRecurring(spaceId, payload)),
    [run, spaceId],
  );
  const update = useCallback(
    (id: string, payload: RecurringPayload) => run(() => apiClient.updateRecurring(spaceId, id, payload)),
    [run, spaceId],
  );
  const remove = useCallback((id: string) => run(() => apiClient.deleteRecurring(spaceId, id)), [run, spaceId]);
  const setActive = useCallback(
    (item: RecurringPayment, active: boolean) =>
      run(() => apiClient.updateRecurring(spaceId, item.id, recurringToPayload(item, { active }))),
    [run, spaceId],
  );

  return {
    items: resource.data,
    loading: resource.loading,
    error: resource.error,
    reload,
    saving,
    create,
    update,
    remove,
    setActive,
  };
}
