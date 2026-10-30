import { Project, ProjectsSummary } from '../domain/project';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/**
 * Les projets de l'espace. La fonction est `async` pour qu'une erreur de lecture (ou un client incomplet) devienne un état
 * d'erreur de la ressource plutôt qu'une exception dans le rendu : l'accueil masque alors simplement sa carte.
 */
export function useProjects(spaceId: string, refreshToken = 0): Resource<Project[]> {
  return useResource(async () => apiClient.fetchProjects(spaceId), [spaceId], refreshToken);
}

export function useProjectsSummary(spaceId: string, refreshToken = 0): Resource<ProjectsSummary> {
  return useResource(async () => apiClient.fetchProjectsSummary(spaceId), [spaceId], refreshToken);
}
