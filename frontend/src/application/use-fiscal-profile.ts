import { useCallback, useState } from 'react';
import { FiscalProfile } from '../domain/aids';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

export function useFiscalProfile() {
  const resource = useResource(() => apiClient.fetchFiscalProfile(), []);
  const { reload } = resource;
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (profile: FiscalProfile) => {
      setSaving(true);
      try {
        await apiClient.saveFiscalProfile(profile);
        reload();
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return { profile: resource.data, loading: resource.loading, error: resource.error, reload, saving, save };
}
