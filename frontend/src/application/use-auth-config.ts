import { apiClient, AuthConfig } from '../infrastructure/api-client';
import { useResource } from './use-resource';

export function useAuthConfig(): { config: AuthConfig | undefined; loading: boolean; failed: boolean; retry: () => void } {
  const resource = useResource(() => apiClient.fetchAuthConfig(), []);
  return { config: resource.data, loading: resource.loading, failed: resource.error !== undefined, retry: resource.reload };
}
