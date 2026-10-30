import { Forecast } from '../domain/forecast';
import { apiClient } from '../infrastructure/api-client';
import { useOfflineQueue } from './use-offline-queue';
import { Resource, useResource } from './use-resource';

export function useForecast(spaceId: string, month: string, refreshToken = 0): Resource<Forecast> {
  const { dataVersion } = useOfflineQueue();
  return useResource(() => apiClient.fetchForecast(spaceId, month), [spaceId, month], dataVersion + refreshToken);
}
