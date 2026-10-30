import { ApiError, NetworkError } from '../infrastructure/api-client';

export function isOfflineError(error: unknown): boolean {
  return error instanceof NetworkError;
}

export function describeError(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) {
    return 'Pas de connexion : réessayez dès que le réseau est revenu.';
  }
  if (error instanceof ApiError && error.status === 401) {
    return 'Votre session a expiré : reconnectez-vous.';
  }
  return fallback;
}
