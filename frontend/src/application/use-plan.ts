import { useCallback, useState } from 'react';
import { Plan } from '../domain/budget';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

export function usePlan(spaceId: string) {
  const resource = useResource(() => apiClient.fetchPlan(spaceId), [spaceId]);
  const { reload } = resource;
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (plan: Plan) => {
      setSaving(true);
      try {
        await apiClient.updatePlan(spaceId, plan);
        reload();
      } finally {
        setSaving(false);
      }
    },
    [spaceId, reload],
  );

  return { plan: resource.data, loading: resource.loading, error: resource.error, saving, save, reload };
}
