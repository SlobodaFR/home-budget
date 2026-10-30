import { useCallback, useEffect, useRef, useState } from 'react';
import { applyStepChange, LifeEvent, LifeEventStep, restoreStep, sortEvents } from '../domain/life-event';
import { apiClient } from '../infrastructure/api-client';

const realNow = () => new Date();
const keyOf = (eventId: string, stepId: string) => `${eventId}/${stepId}`;

/**
 * Cocher une démarche et enregistrer sa note, avec mise à jour optimiste : la case change tout de suite, puis revient en arrière
 * si le serveur refuse (l'erreur est relancée pour que la page l'explique). Le serveur reste la référence : la liste n'est
 * resynchronisée (`onSettled`) qu'une fois toutes les requêtes terminées, pour ne pas écraser une coche encore en vol.
 */
export function useLifeEventSteps(source: LifeEvent[] | undefined, onSettled: () => void, now: () => Date = realNow) {
  const [events, setEvents] = useState<LifeEvent[] | undefined>(source);
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const pending = useRef(0);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  useEffect(() => {
    if (pending.current === 0) {
      setEvents(source);
    }
  }, [source]);

  const track = useCallback(async (eventId: string, stepId: string, request: () => Promise<void>, rollback?: () => void) => {
    const key = keyOf(eventId, stepId);
    pending.current += 1;
    setSaving((previous) => new Set(previous).add(key));
    try {
      await request();
    } catch (error) {
      rollback?.();
      throw error;
    } finally {
      pending.current -= 1;
      setSaving((previous) => {
        const next = new Set(previous);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const findStep = (eventId: string, stepId: string): LifeEventStep | undefined =>
    eventsRef.current?.find((event) => event.id === eventId)?.steps.find((step) => step.stepId === stepId);

  /** Coche ou décoche. Sans effet si la même démarche est déjà en cours d'enregistrement. */
  const toggle = useCallback(
    async (eventId: string, stepId: string, done: boolean): Promise<void> => {
      const original = findStep(eventId, stepId);
      if (!original || savingRef.current.has(keyOf(eventId, stepId))) {
        return;
      }
      setEvents((previous) => previous && applyStepChange(previous, eventId, stepId, { done }, now()));
      await track(
        eventId,
        stepId,
        () => apiClient.setLifeEventStep(eventId, stepId, { done }),
        () => setEvents((previous) => previous && restoreStep(previous, eventId, original)),
      );
      if (pending.current === 0) {
        onSettled();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, onSettled, now],
  );

  /** Enregistre la note (pas d'affichage optimiste : en cas d'échec, la saisie reste dans le champ). `note` : déjà validée et nettoyée. */
  const saveNote = useCallback(
    async (eventId: string, stepId: string, note: string): Promise<void> => {
      const current = findStep(eventId, stepId);
      if (!current) {
        return;
      }
      await track(eventId, stepId, () => apiClient.setLifeEventStep(eventId, stepId, { done: current.doneAt !== null, note }));
      setEvents((previous) => previous && applyStepChange(previous, eventId, stepId, { note }, now()));
      if (pending.current === 0) {
        onSettled();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, onSettled, now],
  );

  /** Affiche tout de suite un événement que le serveur vient de créer (la liste est rechargée juste après). */
  const add = useCallback((created: LifeEvent) => setEvents((previous) => sortEvents([created, ...(previous ?? []).filter((event) => event.id !== created.id)])), []);

  const isSaving = useCallback((eventId: string, stepId: string) => saving.has(keyOf(eventId, stepId)), [saving]);

  return { events, isSaving, toggle, saveNote, add };
}
