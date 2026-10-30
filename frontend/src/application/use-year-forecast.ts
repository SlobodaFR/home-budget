import { YearForecast } from '../domain/year-forecast';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/** Les 12 mois de l'année, à partir des seuls paiements récurrents, pour repérer les pics. */
export function useYearForecast(spaceId: string, year: number, refreshToken = 0): Resource<YearForecast> {
  return useResource(() => apiClient.fetchYearForecast(spaceId, year), [spaceId, year], refreshToken);
}
