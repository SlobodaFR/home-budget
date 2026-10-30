import { Insight } from '../domain/insights';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

export type InsightsState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'ready'; insights: Insight[] };

/**
 * Les conseils sont un « plus » : si le serveur répond une erreur (404, 500, réseau), la carte disparaît
 * discrètement au lieu d'encombrer l'accueil avec un message d'erreur.
 */
export function useInsights(spaceId: string, month: string, refreshToken = 0): InsightsState {
  const resource = useResource(() => apiClient.fetchInsights(spaceId, month), [spaceId, month], refreshToken);
  if (resource.data) {
    return resource.data.length > 0 ? { status: 'ready', insights: resource.data } : { status: 'hidden' };
  }
  return resource.error ? { status: 'hidden' } : { status: 'loading' };
}
