import type { apiClient } from '../infrastructure/api-client';

type ApiClient = typeof apiClient;

/**
 * Type d'un `vi.fn()` qui remplace une méthode de `apiClient` : les arguments
 * restent ceux du vrai client, la valeur retournée est laissée libre pour que
 * les specs puissent fournir des fixtures partielles.
 */
export type ApiMock<K extends keyof ApiClient> = (...args: Parameters<ApiClient[K]>) => Promise<unknown>;
