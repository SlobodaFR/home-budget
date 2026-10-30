import { Provisions } from '../domain/provisions';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/** Les dépenses non mensuelles de l'espace et ce qu'il faut mettre de côté chaque mois pour les lisser. */
export function useProvisions(spaceId: string, refreshToken = 0): Resource<Provisions> {
  return useResource(() => apiClient.fetchProvisions(spaceId), [spaceId], refreshToken);
}
