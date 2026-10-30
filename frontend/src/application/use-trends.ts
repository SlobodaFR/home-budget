import { Trends } from '../domain/trends';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/** Les tendances de l'espace sur les `months` derniers mois. `async` : une erreur de lecture devient un état d'erreur, jamais une exception de rendu. */
export function useTrends(spaceId: string, months: number, refreshToken = 0): Resource<Trends> {
  return useResource(async () => apiClient.fetchTrends(spaceId, months), [spaceId, months], refreshToken);
}
