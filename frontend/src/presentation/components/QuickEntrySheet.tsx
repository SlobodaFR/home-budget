import { FormEvent, useRef, useState } from 'react';
import { Account } from '../../domain/account';
import { Bloc, BLOC_INFO, BLOCS } from '../../domain/bloc';
import { Transaction, TransactionKind, TransactionPayload } from '../../domain/budget';
import { centsToInputValue } from '../../domain/money';
import { isoToDateInput, todayInputValue } from '../../domain/month';
import {
  buildTransactionPayload,
  defaultLabel,
  MAX_LABEL_LENGTH,
  TransactionFormErrors,
} from '../../domain/transaction-form';
import { AccountSelect } from './AccountSelect';
import { BLOC_STYLE } from './bloc-style';
import { BottomSheet } from './BottomSheet';
import { buttonPrimary, inputClass, labelClass } from './ui';

interface Props {
  editing?: Transaction | null;
  defaultBloc: Bloc;
  /** Comptes de l'espace : le sélecteur n'apparaît que s'il y en a au moins un. */
  accounts?: Account[];
  /** Compte présélectionné pour une nouvelle opération (le dernier choisi dans l'espace). */
  defaultAccountId?: string | null;
  onClose: () => void;
  onSubmit: (payload: TransactionPayload) => Promise<void>;
  now?: () => Date;
}

const KINDS: { kind: TransactionKind; label: string }[] = [
  { kind: 'EXPENSE', label: 'Dépense' },
  { kind: 'INCOME', label: 'Revenu' },
];

export function QuickEntrySheet({
  editing = null,
  defaultBloc,
  accounts = [],
  defaultAccountId = null,
  onClose,
  onSubmit,
  now = () => new Date(),
}: Props) {
  const [kind, setKind] = useState<TransactionKind>(editing?.kind ?? 'EXPENSE');
  const [amount, setAmount] = useState(editing ? centsToInputValue(editing.amountCents) : '');
  const [bloc, setBloc] = useState<Bloc>(editing?.bloc ?? defaultBloc);
  const [label, setLabel] = useState(editing?.label ?? '');
  const [date, setDate] = useState(editing ? isoToDateInput(editing.date) : todayInputValue(now()));
  const [accountId, setAccountId] = useState<string | null>(editing ? (editing.accountId ?? null) : defaultAccountId);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const hasAccounts = accounts.some((account) => !account.archived);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    // Une opération déjà rattachée garde son compte même si le sélecteur n'a pas pu se charger.
    const sendAccount = hasAccounts || editing !== null;
    const result = buildTransactionPayload(
      { kind, amount, bloc, label, date, accountId: sendAccount ? accountId : undefined },
      now(),
      editing ?? undefined,
    );
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

  const title = editing ? 'Modifier l’opération' : 'Nouvelle opération';
  const submitLabel = editing ? 'Enregistrer' : kind === 'EXPENSE' ? 'Ajouter la dépense' : 'Ajouter le revenu';

  return (
    <BottomSheet title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <div role="group" aria-label="Type d’opération" className="grid grid-cols-2 rounded-full bg-soft-cloud p-1">
          {KINDS.map((option) => (
            <button
              key={option.kind}
              type="button"
              aria-pressed={kind === option.kind}
              onClick={() => setKind(option.kind)}
              className={`min-h-[44px] rounded-full font-button-md text-body-md font-semibold ${
                kind === option.kind ? 'bg-ink text-surface' : 'text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="quick-amount" className={labelClass}>
            Montant
          </label>
          <div className="relative">
            <input
              id="quick-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0,00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'quick-amount-error' : undefined}
              className={`${inputClass} tabular pr-12 text-right !text-[28px] font-semibold`}
            />
            <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-[24px] font-semibold text-mute">€</span>
          </div>
          {errors.amount && (
            <p id="quick-amount-error" role="alert" className="mt-1 font-body-sm text-body-sm text-error">
              {errors.amount}
            </p>
          )}
        </div>

        {kind === 'EXPENSE' && (
          <div role="group" aria-label="Bloc">
            <span className={labelClass}>Bloc</span>
            <div className="grid grid-cols-2 gap-sm">
              {BLOCS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={bloc === option}
                  onClick={() => setBloc(option)}
                  className={`min-h-[48px] rounded-full border-2 font-button-md text-body-md font-semibold ${
                    bloc === option ? BLOC_STYLE[option].chipOn : BLOC_STYLE[option].chipOff
                  }`}
                >
                  {BLOC_INFO[option].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="quick-label" className={labelClass}>
            Libellé (facultatif)
          </label>
          <input
            id="quick-label"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            autoComplete="off"
            placeholder={defaultLabel(kind, bloc)}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={inputClass}
          />
        </div>

        <AccountSelect id="quick-account" accounts={accounts} value={accountId} onChange={setAccountId} />

        <div>
          <label htmlFor="quick-date" className={labelClass}>
            Date
          </label>
          <input
            id="quick-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-invalid={errors.date ? true : undefined}
            className={inputClass}
          />
          {errors.date && (
            <p role="alert" className="mt-1 font-body-sm text-body-sm text-error">
              {errors.date}
            </p>
          )}
        </div>

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : submitLabel}
        </button>
      </form>
    </BottomSheet>
  );
}
