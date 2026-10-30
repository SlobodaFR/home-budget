import { FormEvent, useRef, useState } from 'react';
import {
  buildDebtPayload,
  DEBT_KIND_LABEL,
  DEBT_KINDS,
  Debt,
  DebtFormErrors,
  DebtPayload,
  debtToForm,
  emptyDebtForm,
  linkableRecurring,
  MAX_DEBT_NAME_LENGTH,
  MAX_PAYMENT_DAY,
  MIN_PAYMENT_DAY,
  REMAINING_HELP,
} from '../../../domain/debt';
import { formatCentsShort } from '../../../domain/money';
import { RecurringPayment } from '../../../domain/recurring';
import { BottomSheet } from '../BottomSheet';
import { buttonPrimary, inputClass, labelClass } from '../ui';
import { DEBT_KIND_ICON } from './debt-style';
import { FieldError, NumberInput } from './fields';

interface Props {
  editing: Debt | null;
  /** Les paiements récurrents de l'espace (la liste proposée est filtrée ici). */
  recurring?: RecurringPayment[];
  onClose: () => void;
  onSubmit: (payload: DebtPayload) => Promise<void>;
  now?: () => Date;
}

export function DebtForm({ editing, recurring = [], onClose, onSubmit, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() => (editing ? debtToForm(editing) : emptyDebtForm(now())));
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((previous) => ({ ...previous, [key]: value }));
  const linkable = linkableRecurring(recurring, values.recurringId || null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildDebtPayload(values);
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

  const hint = (id: string, text: string) => (
    <p id={id} className="mt-1 font-body-sm text-body-sm text-mute">
      {text}
    </p>
  );

  return (
    <BottomSheet title={editing ? 'Modifier le crédit' : 'Nouveau crédit'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <div>
          <label htmlFor="debt-name" className={labelClass}>
            Nom du crédit
          </label>
          <input
            id="debt-name"
            type="text"
            maxLength={MAX_DEBT_NAME_LENGTH}
            autoComplete="off"
            placeholder="Prêt auto"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'debt-name-error' : undefined}
            className={inputClass}
          />
          <FieldError id="debt-name-error" message={errors.name} />
        </div>

        <div role="group" aria-label="Type de crédit">
          <span className={labelClass}>Type</span>
          <div className="grid grid-cols-2 gap-sm min-[420px]:grid-cols-3">
            {DEBT_KINDS.map((kind) => {
              const Icon = DEBT_KIND_ICON[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={values.kind === kind}
                  onClick={() => set('kind', kind)}
                  className={`flex min-h-[48px] items-center justify-center gap-1 rounded-full border-2 px-sm font-button-md text-body-sm font-semibold leading-tight ${
                    values.kind === kind ? 'border-ink bg-ink text-surface' : 'border-hairline bg-white text-ink'
                  }`}
                >
                  <Icon width={18} height={18} className="shrink-0" />
                  {DEBT_KIND_LABEL[kind]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="debt-principal" className={labelClass}>
            Capital emprunté
          </label>
          <NumberInput
            id="debt-principal"
            value={values.principal}
            onChange={(value) => set('principal', value)}
            invalid={Boolean(errors.principal)}
            describedBy={errors.principal ? 'debt-principal-error' : 'debt-principal-hint'}
            placeholder="15 000"
          />
          {hint('debt-principal-hint', 'La somme prêtée au départ par la banque.')}
          <FieldError id="debt-principal-error" message={errors.principal} />
        </div>

        <div>
          <label htmlFor="debt-remaining" className={labelClass}>
            Capital restant dû
          </label>
          <NumberInput
            id="debt-remaining"
            value={values.remaining}
            onChange={(value) => set('remaining', value)}
            invalid={Boolean(errors.remaining)}
            describedBy={errors.remaining ? 'debt-remaining-error' : 'debt-remaining-hint'}
            placeholder="11 200"
          />
          {hint('debt-remaining-hint', REMAINING_HELP)}
          <FieldError id="debt-remaining-error" message={errors.remaining} />
        </div>

        <div>
          <label htmlFor="debt-rate" className={labelClass}>
            Taux annuel
          </label>
          <NumberInput
            id="debt-rate"
            unit="%"
            value={values.rate}
            onChange={(value) => set('rate', value)}
            invalid={Boolean(errors.rate)}
            describedBy={errors.rate ? 'debt-rate-error' : 'debt-rate-hint'}
            placeholder="3,9"
          />
          {hint('debt-rate-hint', 'Le taux indiqué dans votre contrat, hors assurance (ex. 3,9). Mettez 0 pour un crédit sans intérêts.')}
          <FieldError id="debt-rate-error" message={errors.rate} />
        </div>

        <div>
          <label htmlFor="debt-monthly" className={labelClass}>
            Mensualité
          </label>
          <NumberInput
            id="debt-monthly"
            value={values.monthlyPayment}
            onChange={(value) => set('monthlyPayment', value)}
            invalid={Boolean(errors.monthlyPayment)}
            describedBy={errors.monthlyPayment ? 'debt-monthly-error' : 'debt-monthly-hint'}
            placeholder="320"
          />
          {hint('debt-monthly-hint', 'Ce que vous remboursez chaque mois, sans l’assurance.')}
          <FieldError id="debt-monthly-error" message={errors.monthlyPayment} />
        </div>

        <div>
          <label htmlFor="debt-insurance" className={labelClass}>
            Assurance par mois (facultatif)
          </label>
          <NumberInput
            id="debt-insurance"
            value={values.insurance}
            onChange={(value) => set('insurance', value)}
            invalid={Boolean(errors.insurance)}
            describedBy={errors.insurance ? 'debt-insurance-error' : 'debt-insurance-hint'}
            placeholder="0"
          />
          {hint('debt-insurance-hint', 'L’assurance emprunteur, si elle est prélevée en plus. Laissez vide sinon.')}
          <FieldError id="debt-insurance-error" message={errors.insurance} />
        </div>

        <div>
          <label htmlFor="debt-start-date" className={labelClass}>
            Date de début du crédit
          </label>
          <input
            id="debt-start-date"
            type="date"
            value={values.startDate}
            onChange={(event) => set('startDate', event.target.value)}
            aria-invalid={errors.startDate ? true : undefined}
            aria-describedby={errors.startDate ? 'debt-start-date-error' : undefined}
            className={inputClass}
          />
          <FieldError id="debt-start-date-error" message={errors.startDate} />
        </div>

        <div>
          <label htmlFor="debt-payment-day" className={labelClass}>
            Jour de prélèvement
          </label>
          <input
            id="debt-payment-day"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            placeholder="5"
            value={values.paymentDay}
            onChange={(event) => set('paymentDay', event.target.value)}
            aria-invalid={errors.paymentDay ? true : undefined}
            aria-describedby={errors.paymentDay ? 'debt-payment-day-error' : 'debt-payment-day-hint'}
            className={`${inputClass} tabular text-right`}
          />
          {hint('debt-payment-day-hint', `Le jour du mois où la mensualité est prélevée, entre ${MIN_PAYMENT_DAY} et ${MAX_PAYMENT_DAY}.`)}
          <FieldError id="debt-payment-day-error" message={errors.paymentDay} />
        </div>

        {linkable.length > 0 && (
          <div>
            <label htmlFor="debt-recurring" className={labelClass}>
              Paiement récurrent lié (facultatif)
            </label>
            <select id="debt-recurring" value={values.recurringId} onChange={(event) => set('recurringId', event.target.value)} aria-describedby="debt-recurring-hint" className={inputClass}>
              <option value="">Aucun</option>
              {linkable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({formatCentsShort(item.amountCents)}){item.active ? '' : ' (inactif)'}
                </option>
              ))}
            </select>
            {hint('debt-recurring-hint', 'Le paiement récurrent de votre plan qui représente cette mensualité, si vous l’avez déjà ajouté.')}
          </div>
        )}

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter le crédit'}
        </button>
      </form>
    </BottomSheet>
  );
}
