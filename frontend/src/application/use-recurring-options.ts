import { RecurringPayment } from '../domain/recurring';
import { apiClient } from '../infrastructure/api-client';
import { useResource } from './use-resource';

/** Les paiements récurrents de l'espace, pour choisir celui qui représente la mensualité d'un crédit. Silencieux en cas d'échec. */
export function useRecurringOptions(spaceId: string): RecurringPayment[] {
  const resource = useResource(async () => apiClient.fetchRecurring(spaceId), [spaceId]);
  return Array.isArray(resource.data) ? resource.data : [];
}
