import { FormEvent, useRef, useState } from 'react';
import {
  buildDepositPayload,
  DEPOSIT_MODE_LABEL,
  DepositFormErrors,
  DepositMode,
  DepositPayload,
  emptyDepositForm,
  MAX_DEPOSIT_NOTE_LENGTH,
} from '../../../domain/project';
import { buttonPrimary, inputClass, labelClass } from '../ui';

interface Props {
  /** Ce qui est épargné aujourd'hui : un retrait ne peut pas le dépasser. */
  savedCents: number;
  onSubmit: (payload: DepositPayload) => Promise<void>;
  onCancel: () => void;
  now?: () => Date;
}

const MODES: DepositMode[] = ['ADD', 'WITHDRAW'];

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

/** Ajout rapide d'un versement (montant, date, note) ; « Retirer » enregistre un montant négatif. */
export function DepositForm({ savedCents, onSubmit, onCancel, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() => emptyDepositForm(now()));
  const [errors, setErrors] = useState<DepositFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildDepositPayload(values, { savedCents });
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

  const withdraw = values.mode === 'WITHDRAW';

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Nouveau versement" className="flex flex-col gap-lg rounded bg-soft-cloud p-md">
      <div role="group" aria-label="Sens du mouvement" className="grid grid-cols-2 rounded-full bg-white p-1">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={values.mode === mode}
            onClick={() => set('mode', mode)}
            className={`min-h-[44px] rounded-full font-button-md text-body-md font-semibold ${values.mode === mode ? 'bg-ink text-surface' : 'text-ink'}`}
          >
            {DEPOSIT_MODE_LABEL[mode]}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="deposit-amount" className={labelClass}>
          {withdraw ? 'Montant à retirer' : 'Montant versé'}
        </label>
        <div className="relative">
          <input
            id="deposit-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={values.amount}
            onChange={(event) => set('amount', event.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? 'deposit-amount-error' : undefined}
            className={`${inputClass} tabular pr-10 text-right`}
          />
          <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
        </div>
        <FieldError id="deposit-amount-error" message={errors.amount} />
      </div>

      <div>
        <label htmlFor="deposit-date" className={labelClass}>
          Date
        </label>
        <input
          id="deposit-date"
          type="date"
          value={values.date}
          onChange={(event) => set('date', event.target.value)}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? 'deposit-date-error' : undefined}
          className={inputClass}
        />
        <FieldError id="deposit-date-error" message={errors.date} />
      </div>

      <div>
        <label htmlFor="deposit-note" className={labelClass}>
          Note (facultatif)
        </label>
        <input
          id="deposit-note"
          type="text"
          maxLength={MAX_DEPOSIT_NOTE_LENGTH}
          autoComplete="off"
          placeholder={withdraw ? 'Réparation imprévue' : 'Prime de fin d’année'}
          value={values.note}
          onChange={(event) => set('note', event.target.value)}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? 'deposit-note-error' : undefined}
          className={inputClass}
        />
        <FieldError id="deposit-note-error" message={errors.note} />
      </div>

      {submitError && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {submitError}
        </p>
      )}

      <div className="flex gap-sm">
        <button type="button" onClick={onCancel} className="min-h-[48px] rounded-full border border-hairline bg-white px-xl font-button-md text-body-md font-semibold">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className={`${buttonPrimary} flex-1`}>
          {submitting ? 'Enregistrement…' : withdraw ? 'Enregistrer le retrait' : 'Enregistrer le versement'}
        </button>
      </div>
    </form>
  );
}
