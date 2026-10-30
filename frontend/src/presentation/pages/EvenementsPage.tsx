import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useLifeEventActions } from '../../application/use-life-event-actions';
import { useLifeEventSteps } from '../../application/use-life-event-steps';
import { useLifeEventCatalog, useLifeEvents } from '../../application/use-life-events';
import { attachVerification, BIRTH_TYPE, LifeEvent } from '../../domain/life-event';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon, PlusIcon } from '../components/Icons';
import { LifeEventCard } from '../components/life-events/LifeEventCard';
import { LifeEventForm } from '../components/life-events/LifeEventForm';
import { LifeEventsDisclaimer } from '../components/life-events/LifeEventsDisclaimer';
import { LifeEventsEmptyState } from '../components/life-events/LifeEventsEmptyState';
import { LoadingScreen } from '../components/LoadingScreen';
import { useToast } from '../components/Toast';
import { buttonPrimary } from '../components/ui';

type SheetState = { editing: LifeEvent | null } | null;

function describeStepError(error: unknown): string {
  return isOfflineError(error)
    ? 'Pas de connexion : la case est remise comme avant. Réessayez dès que le réseau est revenu.'
    : describeError(error, 'Enregistrement impossible : la case est remise comme avant. Réessayez.');
}

/** Niveau foyer : les mêmes événements quel que soit l'espace choisi, d'où l'absence de sélecteur d'espace. */
export function EvenementsPage() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const lifeEvents = useLifeEvents(version);
  const catalog = useLifeEventCatalog();
  const steps = useLifeEventSteps(lifeEvents.data, refresh);
  const actions = useLifeEventActions(refresh);

  const offline = isOfflineError(lifeEvents.error);
  const retry = () => {
    lifeEvents.reload();
    catalog.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const closeSheet = useCallback(() => setSheet(null), []);
  const source = steps.events ?? lifeEvents.data;
  const events = useMemo(() => (source ? attachVerification(source, catalog.data) : undefined), [source, catalog.data]);
  const birthDefinition = catalog.data?.find((definition) => definition.type === BIRTH_TYPE);

  const handleSubmit = async (payload: { eventDate: string; label?: string }) => {
    const editing = sheet?.editing ?? null;
    try {
      if (editing) {
        await actions.update(editing, { eventDate: payload.eventDate, label: payload.label ?? editing.label });
        toast.show('Événement modifié : les échéances sont recalculées');
      } else {
        const created = await actions.createBirth(payload);
        if (created) {
          steps.add(created);
        }
        toast.show('Naissance ajoutée : voici vos démarches');
      }
    } catch (error) {
      throw new Error(describeError(error, 'L’enregistrement a échoué. Vérifiez la date (de 24 mois avant à 18 mois après aujourd’hui) et réessayez.'));
    }
    closeSheet();
  };

  const handleDelete = async (event: LifeEvent) => {
    try {
      await actions.remove(event);
    } catch (error) {
      throw new Error(describeError(error, 'Suppression impossible. Réessayez.'));
    }
    toast.show('Événement supprimé');
    closeSheet();
  };

  const handleToggle = async (eventId: string, stepId: string, done: boolean) => {
    try {
      await steps.toggle(eventId, stepId, done);
      toast.show(done ? 'Démarche faite. Retrouvez-la dans « Faites ».' : 'Démarche remise à faire.');
    } catch (error) {
      toast.show(describeStepError(error), 'error');
    }
  };

  const handleSaveNote = async (eventId: string, stepId: string, note: string) => {
    try {
      await steps.saveNote(eventId, stepId, note);
    } catch (error) {
      throw new Error(
        isOfflineError(error)
          ? 'Pas de connexion : votre note reste ici, réessayez dès que le réseau est revenu.'
          : describeError(error, 'La note n’a pas pu être enregistrée. Elle reste ici : réessayez.'),
      );
    }
    toast.show('Note enregistrée');
  };

  const addButton = (
    <button type="button" onClick={() => setSheet({ editing: null })} className={`${buttonPrimary} w-full`}>
      <PlusIcon width={18} height={18} />
      Ajouter une naissance
    </button>
  );

  return (
    <>
      <div>
        <Link to="/" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Accueil
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Événements de vie</h2>
        <p className="font-body-sm text-body-sm text-mute">Les démarches à ne pas oublier, avec leurs échéances. Les mêmes pour tout le foyer.</p>
      </div>

      <LifeEventsDisclaimer />

      {events ? (
        events.length === 0 ? (
          <LifeEventsEmptyState definition={birthDefinition} onAdd={() => setSheet({ editing: null })} />
        ) : (
          <>
            {addButton}
            <ul aria-label="Événements de vie du foyer" className="flex flex-col gap-gutter">
              {events.map((event) => (
                <LifeEventCard
                  key={event.id}
                  event={event}
                  isSaving={(stepId) => steps.isSaving(event.id, stepId)}
                  onToggle={(stepId, done) => void handleToggle(event.id, stepId, done)}
                  onSaveNote={(stepId, note) => handleSaveNote(event.id, stepId, note)}
                  onEdit={(target) => setSheet({ editing: target })}
                />
              ))}
            </ul>
          </>
        )
      ) : offline ? (
        <OfflineNotice message="Hors ligne : vos démarches reviendront avec le réseau. Cocher une démarche ou noter quelque chose demande aussi une connexion." onRetry={retry} />
      ) : lifeEvents.error ? (
        <ErrorNotice message={describeError(lifeEvents.error, 'Impossible de charger les événements de vie.')} onRetry={lifeEvents.reload} />
      ) : (
        <LoadingScreen />
      )}

      {sheet && (
        <LifeEventForm
          key={sheet.editing?.id ?? 'new'}
          editing={sheet.editing}
          busy={actions.busy}
          onClose={closeSheet}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
