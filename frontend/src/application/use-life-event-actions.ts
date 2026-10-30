import { useCallback, useState } from 'react';
import { BIRTH_TYPE, LifeEvent, LifeEventUpdatePayload } from '../domain/life-event';
import { apiClient } from '../infrastructure/api-client';

/** Création, modification et suppression des événements ; `onChanged` recharge la liste. `createBirth` renvoie l'événement créé (ou `null` si la réponse est illisible). */
export function useLifeEventActions(onChanged: () => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      setBusy(true);
      try {
        const result = await action();
        onChanged();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  /** Pour l'instant, seule la naissance existe : le type est fixé ici, pas dans le formulaire. */
  const createBirth = useCallback(
    (payload: { eventDate: string; label?: string }) => run(() => apiClient.createLifeEvent({ type: BIRTH_TYPE, ...payload })),
    [run],
  );
  const update = useCallback((event: LifeEvent, payload: LifeEventUpdatePayload) => run(() => apiClient.updateLifeEvent(event.id, payload)), [run]);
  const remove = useCallback((event: LifeEvent) => run(() => apiClient.deleteLifeEvent(event.id)), [run]);

  return { busy, createBirth, update, remove };
}
