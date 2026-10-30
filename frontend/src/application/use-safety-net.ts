import { useCallback, useState } from 'react';
import { SafetyNet } from '../domain/safety-net';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

/** Épargne de sécurité du foyer et son avancement (calculé par le serveur). */
export function useSafetyNet() {
  const resource = useResource(() => apiClient.fetchSafetyNet(), []);
  const { reload } = resource;
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (safetyNet: SafetyNet) => {
      setSaving(true);
      try {
        await apiClient.saveSafetyNet(safetyNet);
        reload();
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return {
    state: resource.data,
    error: resource.error,
    reload,
    saving,
    save,
  };
}
