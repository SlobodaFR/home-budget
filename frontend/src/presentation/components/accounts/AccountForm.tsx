import { FormEvent, useRef, useState } from 'react';
import {
  Account,
  ACCOUNT_KIND_INFO,
  ACCOUNT_KINDS,
  AccountFormErrors,
  AccountPayload,
  accountToForm,
  buildAccountPayload,
  emptyAccountForm,
  MAX_ACCOUNT_NAME_LENGTH,
} from '../../../domain/account';
import { BottomSheet } from '../BottomSheet';
import { buttonPrimary, inputClass, labelClass } from '../ui';

interface Props {
  editing: Account | null;
  /** Les comptes de l'espace (archivés compris) : un nom ne peut pas être pris deux fois. */
  existing: Account[];
  onClose: () => void;
  onSubmit: (payload: AccountPayload) => Promise<void>;
  now?: () => Date;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

export function AccountForm({ editing, existing, onClose, onSubmit, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() => (editing ? accountToForm(editing) : emptyAccountForm(now())));
  const [errors, setErrors] = useState<AccountFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((previous) => ({ ...previous, [key]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildAccountPayload(values, existing, editing?.id);
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

  return (
    <BottomSheet title={editing ? 'Modifier le compte' : 'Nouveau compte'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <div>
          <label htmlFor="account-name" className={labelClass}>
            Nom du compte
          </label>
          <input
            id="account-name"
            type="text"
            maxLength={MAX_ACCOUNT_NAME_LENGTH}
            autoComplete="off"
            autoFocus
            placeholder="Compte commun"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'account-name-error' : undefined}
            className={inputClass}
          />
          <FieldError id="account-name-error" message={errors.name} />
        </div>

        <div role="group" aria-label="Type de compte">
          <span className={labelClass}>Type</span>
          <div className="grid grid-cols-1 gap-sm min-[420px]:grid-cols-3">
            {ACCOUNT_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={values.kind === kind}
                onClick={() => set('kind', kind)}
                className={`min-h-[48px] rounded-full border-2 px-md font-button-md text-body-sm font-semibold ${
                  values.kind === kind ? 'border-ink bg-ink text-surface' : 'border-hairline bg-white text-ink'
                }`}
              >
                {ACCOUNT_KIND_INFO[kind].label}
              </button>
            ))}
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-mute">{ACCOUNT_KIND_INFO[values.kind].description}</p>
        </div>

        <div>
          <label htmlFor="account-balance" className={labelClass}>
            Solde d’ouverture
          </label>
          <div className="relative">
            <input
              id="account-balance"
              type="text"
              inputMode="text"
              autoComplete="off"
              placeholder="0,00"
              value={values.openingBalance}
              onChange={(event) => set('openingBalance', event.target.value)}
              aria-invalid={errors.openingBalance ? true : undefined}
              aria-describedby={errors.openingBalance ? 'account-balance-error' : 'account-balance-hint'}
              className={`${inputClass} tabular pr-10 text-right`}
            />
            <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
          </div>
          <p id="account-balance-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Ce que contenait le compte à la date ci-dessous. Mettez un « - » devant s’il était à découvert (ex. -150).
          </p>
          <FieldError id="account-balance-error" message={errors.openingBalance} />
        </div>

        <div>
          <label htmlFor="account-date" className={labelClass}>
            Date d’ouverture
          </label>
          <input
            id="account-date"
            type="date"
            value={values.openingDate}
            onChange={(event) => set('openingDate', event.target.value)}
            aria-invalid={errors.openingDate ? true : undefined}
            aria-describedby={errors.openingDate ? 'account-date-error' : 'account-date-hint'}
            className={inputClass}
          />
          <p id="account-date-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Seules les opérations à partir de ce jour comptent dans le solde.
          </p>
          <FieldError id="account-date-error" message={errors.openingDate} />
        </div>

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le compte'}
        </button>
      </form>
    </BottomSheet>
  );
}
