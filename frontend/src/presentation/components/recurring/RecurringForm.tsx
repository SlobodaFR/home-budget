import { FormEvent, useRef, useState } from 'react';
import { BLOC_INFO, BLOCS } from '../../../domain/bloc';
import { Account, selectableAccounts } from '../../../domain/account';
import { TransactionKind } from '../../../domain/budget';
import { AidRule } from '../../../domain/aids';
import {
  buildRecurringPayload,
  emptyRecurringForm,
  MAX_RECURRING_LABEL_LENGTH,
  RecurringFormErrors,
  RecurringPayload,
  RecurringPayment,
  recurringToForm,
} from '../../../domain/recurring';
import { AccountSelect } from '../AccountSelect';
import { BLOC_STYLE } from '../bloc-style';
import { BottomSheet } from '../BottomSheet';
import { buttonPrimary, inputClass, labelClass } from '../ui';

interface Props {
  editing: RecurringPayment | null;
  /** Espace commun : seul endroit où l'on peut rattacher une aide officielle. */
  allowAid: boolean;
  /** Catalogue des aides ; `null` s'il n'a pas pu être chargé (le sélecteur est alors masqué). */
  aidRules: AidRule[] | null;
  /** Comptes de l'espace : le sélecteur n'apparaît que s'il y en a au moins un. */
  accounts?: Account[];
  /** Compte présélectionné pour un nouveau paiement (le dernier choisi dans l'espace). */
  defaultAccountId?: string | null;
  onClose: () => void;
  onSubmit: (payload: RecurringPayload) => Promise<void>;
  now?: () => Date;
}

const KINDS: { kind: TransactionKind; label: string }[] = [
  { kind: 'EXPENSE', label: 'Dépense' },
  { kind: 'INCOME', label: 'Revenu' },
];

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

export function RecurringForm({ editing, allowAid, aidRules, accounts = [], defaultAccountId = null, onClose, onSubmit, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() =>
    editing ? recurringToForm(editing) : { ...emptyRecurringForm(now()), accountId: defaultAccountId ?? '' },
  );
  const [errors, setErrors] = useState<RecurringFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const selectedAid = aidRules?.find((rule) => rule.id === values.aidRuleId) ?? null;
  const showAid = allowAid && values.kind === 'EXPENSE' && aidRules !== null && aidRules.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildRecurringPayload(values, { allowAid, accountSelectable: selectableAccounts(accounts, values.accountId || null).length > 0 });
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
    <BottomSheet title={editing ? 'Modifier le paiement' : 'Nouveau paiement récurrent'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <div role="group" aria-label="Type de paiement" className="grid grid-cols-2 rounded-full bg-soft-cloud p-1">
          {KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={values.kind === option.kind}
              onClick={() => set('kind', option.kind)}
              className={`min-h-[44px] rounded-full font-button-md text-body-md font-semibold ${
                values.kind === option.kind ? 'bg-ink text-surface' : 'text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {values.kind === 'EXPENSE' && (
          <div role="group" aria-label="Bloc">
            <span className={labelClass}>Bloc</span>
            <div className="grid grid-cols-2 gap-sm">
              {BLOCS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={values.bloc === option}
                  onClick={() => set('bloc', option)}
                  className={`min-h-[48px] rounded-full border-2 font-button-md text-body-md font-semibold ${
                    values.bloc === option ? BLOC_STYLE[option].chipOn : BLOC_STYLE[option].chipOff
                  }`}
                >
                  {BLOC_INFO[option].label}
                </button>
              ))}
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-mute">{BLOC_INFO[values.bloc].description}</p>
          </div>
        )}

        <div>
          <label htmlFor="rec-label" className={labelClass}>
            Libellé
          </label>
          <input
            id="rec-label"
            type="text"
            maxLength={MAX_RECURRING_LABEL_LENGTH}
            autoComplete="off"
            placeholder={values.kind === 'INCOME' ? 'Salaire' : 'Loyer'}
            value={values.label}
            onChange={(event) => set('label', event.target.value)}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'rec-label-error' : 'rec-label-hint'}
            className={inputClass}
          />
          <p id="rec-label-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Prenez le nom qui apparaît sur votre relevé : c’est ainsi qu’on retrouve le paiement.
          </p>
          <FieldError id="rec-label-error" message={errors.label} />
        </div>

        <div>
          <label htmlFor="rec-amount" className={labelClass}>
            Montant par mois
          </label>
          <div className="relative">
            <input
              id="rec-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={values.amount}
              onChange={(event) => set('amount', event.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'rec-amount-error' : undefined}
              className={`${inputClass} tabular pr-10 text-right`}
            />
            <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
          </div>
          <FieldError id="rec-amount-error" message={errors.amount} />
        </div>

        <div>
          <label htmlFor="rec-day" className={labelClass}>
            Jour du mois (facultatif)
          </label>
          <input
            id="rec-day"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            placeholder="5"
            value={values.dayOfMonth}
            onChange={(event) => set('dayOfMonth', event.target.value)}
            aria-invalid={errors.dayOfMonth ? true : undefined}
            aria-describedby={errors.dayOfMonth ? 'rec-day-error' : 'rec-day-hint'}
            className={inputClass}
          />
          <p id="rec-day-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Si vous ne le connaissez pas, laissez vide : le paiement sera compté en fin de mois.
          </p>
          <FieldError id="rec-day-error" message={errors.dayOfMonth} />
        </div>

        <div className="grid grid-cols-1 gap-lg min-[420px]:grid-cols-2">
          <div>
            <label htmlFor="rec-start" className={labelClass}>
              Début
            </label>
            <input
              id="rec-start"
              type="date"
              value={values.startDate}
              onChange={(event) => set('startDate', event.target.value)}
              aria-invalid={errors.startDate ? true : undefined}
              aria-describedby={errors.startDate ? 'rec-start-error' : undefined}
              className={inputClass}
            />
            <FieldError id="rec-start-error" message={errors.startDate} />
          </div>
          <div>
            <label htmlFor="rec-end" className={labelClass}>
              Fin (facultatif)
            </label>
            <input
              id="rec-end"
              type="date"
              value={values.endDate}
              onChange={(event) => set('endDate', event.target.value)}
              aria-invalid={errors.endDate ? true : undefined}
              aria-describedby={errors.endDate ? 'rec-end-error' : undefined}
              className={inputClass}
            />
            <FieldError id="rec-end-error" message={errors.endDate} />
          </div>
        </div>

        <AccountSelect
          id="rec-account"
          accounts={accounts}
          value={values.accountId || null}
          onChange={(accountId) => set('accountId', accountId ?? '')}
          hint="Le compte sur lequel ce paiement passe : on pourra projeter son solde de fin de mois."
        />

        {showAid && (
          <div>
            <label htmlFor="rec-aid" className={labelClass}>
              Aide officielle
            </label>
            <select
              id="rec-aid"
              value={values.aidRuleId}
              onChange={(event) => set('aidRuleId', event.target.value)}
              aria-describedby="rec-aid-hint"
              className={inputClass}
            >
              <option value="">Aucune</option>
              {aidRules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
            <p id="rec-aid-hint" className="mt-1 font-body-sm text-body-sm text-mute">
              {selectedAid
                ? `${selectedAid.ratePercent} % de crédit d’impôt. ${selectedAid.capDescription}`
                : 'Si une partie de ce paiement vous est remboursée (crédit d’impôt), choisissez la règle : on calculera son coût réel.'}
            </p>
          </div>
        )}

        <label className="flex min-h-[44px] items-center gap-md font-body-md text-body-md">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(event) => set('active', event.target.checked)}
            className="h-6 w-6 accent-ink"
          />
          Paiement actif (compté dans le prévisionnel)
        </label>

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le paiement'}
        </button>
      </form>
    </BottomSheet>
  );
}
