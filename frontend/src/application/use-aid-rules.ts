import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

/** Catalogue des règles d'aide. `enabled = false` (espace personnel) : aucun appel n'est fait. */
export function useAidRules(enabled: boolean) {
  const resource = useResource(
    () => (enabled ? apiClient.fetchAidRules() : Promise.resolve(null)),
    [enabled],
  );
  return { rules: resource.data ?? null, loading: enabled && resource.loading, error: resource.error, reload: resource.reload };
}
