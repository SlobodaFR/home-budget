import { AidsSummary } from '../domain/aids';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

export function useAids(spaceId: string, year: number, refreshToken = 0): Resource<AidsSummary> {
  return useResource(() => apiClient.fetchAids(spaceId, year), [spaceId, year], refreshToken);
}
