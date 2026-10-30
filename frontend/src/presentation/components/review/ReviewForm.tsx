import { FormEvent, useRef, useState } from 'react';
import {
  answersEqual,
  buildReviewPayload,
  describeCompletion,
  describeCounter,
  MAX_REVIEW_ANSWER_LENGTH,
  MonthlyReview,
  remainingCharacters,
  REVIEW_FIELDS,
  REVIEW_QUESTIONS,
  ReviewAnswers,
  ReviewField,
  ReviewFormErrors,
  ReviewPayload,
} from '../../../domain/review';
import { CheckIcon, PencilIcon, WifiOffIcon } from '../Icons';
import { buttonPrimary, buttonSecondary, cardClass, inputClass } from '../ui';

interface Props {
  review: MonthlyReview;
  /** Ce qu'il faut afficher au départ : le brouillon gardé en mémoire s'il y en a un, sinon les réponses du serveur. */
  initialValues: ReviewAnswers;
  /** Vrai quand le navigateur se sait hors ligne : l'enregistrement attendra le retour du réseau. */
  offline: boolean;
  onChange: (values: ReviewAnswers) => void;
  /** Envoie la revue ; rejette avec un `Error` au message lisible si l'enregistrement échoue. */
  onSave: (payload: ReviewPayload) => Promise<void>;
}

function Recap({ review, onEdit }: { review: MonthlyReview; onEdit: () => void }) {
  return (
    <div className="flex flex-col gap-gutter">
      <p role="status" className="flex items-start gap-sm rounded bg-success/10 p-md font-body-md text-body-md font-semibold text-success">
        <CheckIcon width={20} height={20} className="mt-0.5 shrink-0" />
        {review.completedAt ? describeCompletion(review.completedAt) : 'Revue terminée'}
      </p>
      <dl className={`${cardClass} flex flex-col gap-md`}>
        {REVIEW_FIELDS.map((field) => (
          <div key={field}>
            <dt className="font-label-caps text-label-caps uppercase text-mute">{REVIEW_QUESTIONS[field].label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words font-body-md text-body-md">
              {review.answers[field].trim() === '' ? <span className="text-mute">Pas de réponse</span> : review.answers[field]}
            </dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onEdit} className={`${buttonSecondary} w-full`}>
        <PencilIcon width={18} height={18} />
        Modifier ma revue
      </button>
    </div>
  );
}

/**
 * Étape 2 : trois questions, 500 caractères au plus chacune. « Enregistrer le brouillon » garde les réponses pour plus tard,
 * « Terminer la revue » exige une décision. Quoi qu'il arrive (hors ligne, erreur du serveur), le texte saisi reste à l'écran.
 */
export function ReviewForm({ review, initialValues, offline, onChange, onSave }: Props) {
  const done = review.status === 'DONE';
  const [values, setValues] = useState<ReviewAnswers>(initialValues);
  const [saved, setSaved] = useState<ReviewAnswers>(review.answers);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<ReviewFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState<'draft' | 'complete' | null>(null);
  const submittingRef = useRef(false);
  const fieldRefs = useRef<Partial<Record<ReviewField, HTMLTextAreaElement | null>>>({});

  const dirty = !answersEqual(values, saved);
  const showRecap = done && !editing;

  if (showRecap) {
    return <Recap review={{ ...review, answers: saved }} onEdit={() => setEditing(true)} />;
  }

  const change = (field: ReviewField, text: string) => {
    const next = { ...values, [field]: text };
    setValues(next);
    onChange(next);
    if (errors[field]) {
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    }
  };

  const submit = async (complete: boolean) => {
    if (submittingRef.current) {
      return;
    }
    const result = buildReviewPayload(values, complete);
    if (!result.ok) {
      setErrors(result.errors);
      setSubmitError(null);
      const first = REVIEW_FIELDS.find((field) => result.errors[field]);
      if (first) {
        fieldRefs.current[first]?.focus();
      }
      return;
    }
    setErrors({});
    setSubmitError(null);
    submittingRef.current = true;
    setPending(complete ? 'complete' : 'draft');
    try {
      await onSave(result.payload);
      setValues(result.payload.answers);
      setSaved(result.payload.answers);
      onChange(result.payload.answers);
      setEditing(false);
    } catch (error) {
      // Le texte saisi n'est jamais effacé : on garde les champs tels quels et on explique.
      setSubmitError(error instanceof Error ? error.message : 'L’enregistrement a échoué. Votre texte est conservé : réessayez.');
    } finally {
      submittingRef.current = false;
      setPending(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Le bouton principal du formulaire termine toujours la revue (ou enregistre une revue déjà terminée).
    void submit(true);
  };

  const cancelEdit = () => {
    setValues(saved);
    onChange(saved);
    setErrors({});
    setSubmitError(null);
    setEditing(false);
  };

  const busy = pending !== null;

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Mes trois questions" className="flex flex-col gap-gutter">
      {review.status === 'DRAFT' && !dirty && <p className="font-body-sm text-body-sm text-mute">Brouillon enregistré : vous pouvez le reprendre à tout moment.</p>}

      {REVIEW_FIELDS.map((field) => {
        const question = REVIEW_QUESTIONS[field];
        const text = values[field];
        const error = errors[field];
        const remaining = remainingCharacters(text);
        const id = `review-${field}`;
        return (
          <div key={field}>
            <label htmlFor={id} className="block font-body-md text-body-md font-semibold">
              {question.label}
              {field === 'decision' && <span className="font-body-sm text-body-sm font-normal text-mute"> (obligatoire pour terminer)</span>}
            </label>
            <p id={`${id}-hint`} className="mb-1 font-body-sm text-body-sm text-mute">
              {question.hint}
            </p>
            <textarea
              id={id}
              ref={(element) => {
                fieldRefs.current[field] = element;
              }}
              value={text}
              rows={3}
              maxLength={MAX_REVIEW_ANSWER_LENGTH}
              placeholder={question.placeholder}
              aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`}
              aria-invalid={error ? true : undefined}
              onChange={(event) => change(field, event.target.value)}
              className={`${inputClass} min-h-[96px] resize-y py-md ${error ? 'border-error' : ''}`}
            />
            <div className="mt-1 flex items-start justify-between gap-md">
              <div className="min-w-0 flex-1">
                {error && (
                  <p id={`${id}-error`} role="alert" className="font-body-sm text-body-sm font-semibold text-error">
                    {error}
                  </p>
                )}
              </div>
              <p id={`${id}-count`} aria-live={remaining <= 50 ? 'polite' : 'off'} className={`tabular shrink-0 font-body-sm text-body-sm ${remaining <= 50 ? 'font-semibold text-ink' : 'text-mute'}`}>
                {describeCounter(text)}
              </p>
            </div>
          </div>
        );
      })}

      {offline && (
        <p role="status" className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          <WifiOffIcon width={20} height={20} className="mt-0.5 shrink-0" />
          Vous êtes hors ligne. Vous pouvez écrire : votre texte reste sur cet écran, et l’enregistrement se fera quand le réseau sera revenu.
        </p>
      )}

      {submitError && (
        <p role="alert" className="rounded border border-error/30 bg-error/5 p-md font-body-sm text-body-sm text-error">
          {submitError}
        </p>
      )}

      <p aria-live="polite" className="font-body-sm text-body-sm text-mute" data-testid="review-save-state">
        {dirty ? 'Modifications pas encore enregistrées.' : saved.wentWell || saved.surprise || saved.decision ? 'Tout est enregistré.' : ''}
      </p>

      <div className="flex flex-col gap-md">
        {done || editing ? (
          <>
            <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
              {pending === 'complete' ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
            <button type="button" disabled={busy} onClick={cancelEdit} className={`${buttonSecondary} w-full`}>
              Annuler
            </button>
          </>
        ) : (
          <>
            <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
              {pending === 'complete' ? 'Enregistrement…' : 'Terminer la revue'}
            </button>
            <button type="button" disabled={busy} onClick={() => void submit(false)} className={`${buttonSecondary} w-full`}>
              {pending === 'draft' ? 'Enregistrement…' : 'Enregistrer le brouillon'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
