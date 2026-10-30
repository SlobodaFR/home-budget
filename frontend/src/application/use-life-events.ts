import { LifeEvent, LifeEventDefinition } from '../domain/life-event';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/**
 * Les événements de vie du foyer (niveau foyer : pas d'espace). La fonction est `async` pour qu'une erreur de lecture
 * (ou un client incomplet) devienne un état d'erreur de la ressource plutôt qu'une exception dans le rendu.
 */
export function useLifeEvents(refreshToken = 0): Resource<LifeEvent[]> {
  return useResource(async () => apiClient.fetchLifeEvents(), [], refreshToken);
}

/** Le catalogue sert à afficher la date de vérification des sources et à expliquer l'écran vide : un « plus », jamais bloquant. */
export function useLifeEventCatalog(): Resource<LifeEventDefinition[]> {
  return useResource(async () => apiClient.fetchLifeEventCatalog(), []);
}
