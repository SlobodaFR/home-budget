import { useResource } from './use-resource';
import { apiClient } from '../infrastructure/api-client';

export function useContribution(refreshToken: number) {
  const resource = useResource(() => apiClient.fetchContribution(), [], refreshToken);
  return { contribution: resource.data, loading: resource.loading, error: resource.error, reload: resource.reload };
}
