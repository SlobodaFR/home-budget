import { useCallback, useState } from 'react';
import { MonthlyReview, ReviewHistoryItem, ReviewPayload } from '../domain/review';
import { ApiError, apiClient, NetworkError } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/**
 * La revue d'un mois (réponses et bilan recalculé par le serveur). La fonction est `async` : une erreur de lecture, ou un
 * client incomplet, devient un état d'erreur de la ressource plutôt qu'une exception dans le rendu.
 */
export function useReview(spaceId: string, month: string | null, refreshToken = 0): Resource<MonthlyReview | null> {
  return useResource(async () => (month === null ? null : apiClient.fetchReview(spaceId, month)), [spaceId, month], refreshToken);
}

/** L'historique des revues commencées, de la plus récente à la plus ancienne. */
export function useReviewHistory(spaceId: string, refreshToken = 0): Resource<ReviewHistoryItem[]> {
  return useResource(async () => apiClient.fetchReviews(spaceId), [spaceId], refreshToken);
}

/** Enregistrement d'un brouillon ou fin de la revue ; `onSaved` recharge la revue et l'historique. */
export function useReviewActions(spaceId: string, month: string, onSaved: () => void) {
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (payload: ReviewPayload) => {
      setBusy(true);
      try {
        await apiClient.saveReview(spaceId, month, payload);
        onSaved();
      } finally {
        setBusy(false);
      }
    },
    [spaceId, month, onSaved],
  );

  return { busy, save };
}

/** Pourquoi l'enregistrement a échoué, et surtout : le texte saisi est toujours conservé à l'écran. */
export function describeReviewSaveError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Pas de connexion : votre texte est conservé sur cet écran. Réessayez dès que le réseau est revenu.';
  }
  if (error instanceof ApiError && error.status === 401) {
    return 'Votre session a expiré : reconnectez-vous. Votre texte reste à l’écran tant que vous ne quittez pas la page.';
  }
  if (error instanceof ApiError && error.status === 400) {
    return 'Cette revue n’a pas été acceptée (500 caractères au plus par réponse, et une décision pour la terminer). Votre texte est conservé.';
  }
  return 'L’enregistrement a échoué. Votre texte est conservé : réessayez dans un instant.';
}
