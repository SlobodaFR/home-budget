import { Debt, DebtsSummary } from '../domain/debt';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/**
 * Les crédits de l'espace. La fonction est `async` pour qu'une erreur de lecture (ou un client incomplet) devienne un état
 * d'erreur de la ressource plutôt qu'une exception dans le rendu : l'accueil masque alors simplement son lien.
 */
export function useDebts(spaceId: string, refreshToken = 0): Resource<Debt[]> {
  return useResource(async () => apiClient.fetchDebts(spaceId), [spaceId], refreshToken);
}

export function useDebtsSummary(spaceId: string, refreshToken = 0): Resource<DebtsSummary> {
  return useResource(async () => apiClient.fetchDebtsSummary(spaceId), [spaceId], refreshToken);
}
