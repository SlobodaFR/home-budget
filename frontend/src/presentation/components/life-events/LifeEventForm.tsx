import { FormEvent, useRef, useState } from 'react';
import {
  BIRTH_DEFAULT_LABEL,
  buildLifeEventPayload,
  emptyLifeEventForm,
  eventDateBounds,
  LifeEvent,
  LifeEventFormErrors,
  lifeEventToForm,
  MAX_EVENT_LABEL_LENGTH,
} from '../../../domain/life-event';
import { BottomSheet } from '../BottomSheet';
import { TrashIcon } from '../Icons';
import { buttonPrimary, inputClass, labelClass } from '../ui';

interface Props {
  /** `null` : nouvelle naissance. */
  editing: LifeEvent | null;
  busy?: boolean;
  onClose: () => void;
  /** Lève une `Error` dont le message est affiché dans le formulaire. */
  onSubmit: (payload: { eventDate: string; label?: string }) => Promise<void>;
  onDelete?: (event: LifeEvent) => Promise<void>;
  now?: () => Date;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

export function LifeEventForm({ editing, busy = false, onClose, onSubmit, onDelete, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() => (editing ? lifeEventToForm(editing) : emptyLifeEventForm()));
  const [errors, setErrors] = useState<LifeEventFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const submittingRef = useRef(false);
  const bounds = eventDateBounds(now());
  const title = editing ? 'Modifier l’événement' : 'Ajouter une naissance';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildLifeEventPayload(values, { now: now(), labelRequired: editing !== null });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'L’enregistrement a échoué.');
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editing || !onDelete || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onDelete(editing);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'La suppression a échoué.');
      submittingRef.current = false;
      setSubmitting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <BottomSheet title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <div>
          <label htmlFor="life-event-date" className={labelClass}>
            Date de naissance (prévue ou réelle)
          </label>
          <input
            id="life-event-date"
            type="date"
            min={bounds.min}
            max={bounds.max}
            value={values.eventDate}
            onChange={(event) => setValues((previous) => ({ ...previous, eventDate: event.target.value }))}
            aria-invalid={errors.eventDate ? true : undefined}
            aria-describedby={errors.eventDate ? 'life-event-date-error' : 'life-event-date-hint'}
            className={inputClass}
          />
          <p id="life-event-date-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            La date prévue si l’enfant n’est pas encore né, sinon la vraie date. Vous pourrez la corriger : les échéances sont alors recalculées et les démarches déjà
            faites restent faites.
          </p>
          <FieldError id="life-event-date-error" message={errors.eventDate} />
        </div>

        <div>
          <label htmlFor="life-event-label" className={labelClass}>
            {editing ? 'Libellé' : 'Libellé (facultatif)'}
          </label>
          <input
            id="life-event-label"
            type="text"
            autoComplete="off"
            placeholder={BIRTH_DEFAULT_LABEL}
            value={values.label}
            onChange={(event) => setValues((previous) => ({ ...previous, label: event.target.value }))}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'life-event-label-error' : 'life-event-label-hint'}
            className={inputClass}
          />
          <p id="life-event-label-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            {MAX_EVENT_LABEL_LENGTH} caractères au plus. Tous les membres du foyer le voient : inutile d’y mettre un prénom ou une information sensible.
          </p>
          <FieldError id="life-event-label-error" message={errors.label} />
        </div>

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting || busy} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Afficher mes démarches'}
        </button>

        {editing && onDelete && (
          <div className="border-t border-hairline-soft pt-md">
            {confirmingDelete ? (
              <div className="flex flex-col gap-md">
                <p className="font-body-md text-body-md font-semibold">Supprimer cet événement et le suivi de ses démarches ?</p>
                <div className="flex gap-sm">
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-[44px] rounded-full border border-hairline px-lg font-button-md text-body-sm font-semibold">
                    Non, la garder
                  </button>
                  <button
                    type="button"
                    disabled={submitting || busy}
                    onClick={() => void handleDelete()}
                    className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
                  >
                    Oui, supprimer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-lg font-body-sm text-body-sm font-semibold text-error hover:bg-error/5"
              >
                <TrashIcon width={18} height={18} />
                Supprimer cet événement
              </button>
            )}
          </div>
        )}
      </form>
    </BottomSheet>
  );
}
