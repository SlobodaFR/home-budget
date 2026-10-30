import { useCallback, useState } from 'react';
import { ContributionPaymentPayload, ContributionPaymentResult, ContributionReport } from '../domain/contribution-tracking';
import { Account } from '../domain/account';
import { ApiError, apiClient, NetworkError } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';

/** Où en sont les contributions du mois. `async` : une erreur de lecture devient un état d'erreur, jamais une exception de rendu. */
export function useContributionStatus(month: string, refreshToken = 0): Resource<ContributionReport> {
  return useResource(async () => apiClient.fetchContributionStatus(month), [month], refreshToken);
}

/** Enregistre un versement. Pas de file d’attente hors ligne : l'échec est relancé tel quel et le formulaire garde la saisie. */
export function useContributionPayment() {
  const [busy, setBusy] = useState(false);

  const pay = useCallback(async (payload: ContributionPaymentPayload): Promise<ContributionPaymentResult> => {
    setBusy(true);
    try {
      return await apiClient.createContributionPayment(payload);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, pay };
}

/** Les comptes d'un espace (pour choisir où a atterri le versement). Liste vide tant que ça charge, en cas d'échec ou sans espace. */
export function useSpaceAccounts(spaceId: string | null): Account[] {
  const resource = useResource(async () => (spaceId === null ? [] : apiClient.fetchAccounts(spaceId)), [spaceId]);
  return Array.isArray(resource.data) ? resource.data : [];
}

/** Pourquoi le versement n'a pas été enregistré, avec la certitude que rien n'a été créé à moitié. */
export function describePaymentError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Pas de connexion : un versement ne peut pas être enregistré hors ligne, et il n’est pas mis en attente. Vos saisies sont conservées : réessayez dès que le réseau est revenu.';
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Aucun foyer n’a été trouvé : créez ou rejoignez un foyer avant d’enregistrer une contribution.';
    }
    if (error.status === 401) {
      return 'Votre session a expiré : reconnectez-vous. Rien n’a été enregistré.';
    }
    if (error.status === 400) {
      return 'Ce versement n’a pas été accepté : vérifiez le montant (supérieur à 0), le mois et les comptes choisis. Rien n’a été enregistré.';
    }
  }
  return 'L’enregistrement a échoué. Rien n’a été enregistré : réessayez dans un instant.';
}
