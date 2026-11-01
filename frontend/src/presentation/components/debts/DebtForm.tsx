import { FormEvent, useCallback, useRef, useState } from 'react';
import { useExtractionCapabilities } from '../../../application/use-debt-extraction';
import {
  buildDebtPayload,
  DEBT_KIND_LABEL,
  DEBT_KINDS,
  Debt,
  DebtFormErrors,
  DebtPayload,
  debtToForm,
  emptyDebtForm,
  GUARANTEE_KIND_LABEL,
  GUARANTEE_KINDS,
  hasContractDetails,
  INSURANCE_MODE_LABEL,
  INSURANCE_MODES,
  linkableRecurring,
  MAX_CONTRACT_REFERENCE_LENGTH,
  MAX_DEBT_NAME_LENGTH,
  MAX_LENDER_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PAYMENT_DAY,
  MIN_PAYMENT_DAY,
  NOTES_HELP,
  QUOTITY_HELP,
  RATE_TYPE_HELP,
  RATE_TYPE_LABEL,
  RATE_TYPE_UNKNOWN_LABEL,
  RATE_TYPES,
  rateTypeWarning,
  REMAINING_HELP,
  TermUnit,
} from '../../../domain/debt';
import {
  applyExtractedFields,
  clearPrefillMark,
  describePrefill,
  ExtractedField,
  isFormUntouched,
  PrefillMarks,
  SkippedField,
} from '../../../domain/debt-extraction';
import { formatCentsShort } from '../../../domain/money';
import { RecurringPayment } from '../../../domain/recurring';
import { BottomSheet } from '../BottomSheet';
import { ChevronRightIcon, InfoIcon, UploadIcon } from '../Icons';
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../ui';
import { ContractImport } from './contract/ContractImport';
import { PrefillMark } from './contract/PrefillMark';
import { DEBT_KIND_ICON } from './debt-style';
import { FieldError, NumberInput } from './fields';

interface PrefillReport {
  message: string;
  skipped: SkippedField[];
}

interface Props {
  editing: Debt | null;
  /** L'espace où le crédit sera créé : sans lui (ou en modification), l'import d'un contrat n'est pas proposé. */
  spaceId?: string;
  /** Les paiements récurrents de l'espace (la liste proposée est filtrée ici). */
  recurring?: RecurringPayment[];
  /** Les prêteurs déjà saisis dans l'espace, proposés en suggestion. */
  lenders?: string[];
  onClose: () => void;
  onSubmit: (payload: DebtPayload) => Promise<void>;
  now?: () => Date;
}

export function DebtForm({ editing, spaceId, recurring = [], lenders = [], onClose, onSubmit, now = () => new Date() }: Props) {
  const [values, setValues] = useState(() => (editing ? debtToForm(editing) : emptyDebtForm(now())));
  const initialValues = useRef(values);
  const [view, setView] = useState<'form' | 'import'>('form');
  const [marks, setMarks] = useState<PrefillMarks>({});
  const [prefillReport, setPrefillReport] = useState<PrefillReport | null>(null);
  const capabilities = useExtractionCapabilities(Boolean(spaceId) && !editing);
  // Le bouton d'import n'apparaît que sur un formulaire encore vierge : il n'écrase jamais ce qui a été saisi.
  const canImport = capabilities !== null && spaceId !== undefined && isFormUntouched(values, initialValues.current);
  const [errors, setErrors] = useState<DebtFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    // Modifier un champ prérempli efface son repère « à vérifier » : la personne l'a relu.
    setMarks((previous) => clearPrefillMark(previous, key));
  };
  const leaveImport = useCallback(() => setView('form'), []);
  const applyExtraction = (fields: ExtractedField[]) => {
    const result = applyExtractedFields(values, fields);
    setValues(result.values);
    setMarks(result.marks);
    setErrors({});
    setPrefillReport({ message: describePrefill(result), skipped: result.skipped });
    if (result.applied.some((field) => field === 'contractReference' || field === 'feesCents' || field === 'guaranteeKind' || field === 'guaranteeCents')) {
      setDetailsOpen(true);
    }
    setView('form');
  };
  const linkable = linkableRecurring(recurring, values.recurringId || null);
  const [detailsOpen, setDetailsOpen] = useState(() => hasContractDetails(values));
  const percentInsurance = values.insuranceMode !== 'FIXED';
  const warning = rateTypeWarning(values.rateType === '' ? null : values.rateType);

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

  if (view === 'import' && capabilities && spaceId) {
    return (
      <BottomSheet title="Importer un contrat" onClose={leaveImport}>
        <ContractImport spaceId={spaceId} capabilities={capabilities} onApply={applyExtraction} onBack={leaveImport} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title={editing ? 'Modifier le crédit' : 'Nouveau crédit'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        {prefillReport && (
          <section role="status" aria-label="Résultat de l’import du contrat" className="flex flex-col gap-sm rounded border border-plaisir/60 bg-plaisir/10 p-md font-body-sm text-body-sm">
            <p>{prefillReport.message}</p>
            <p>À compléter vous-même : le nom du crédit, son type, le capital restant dû et le jour de prélèvement.</p>
            {prefillReport.skipped.length > 0 && (
              <p>
                Non repris : {prefillReport.skipped.map((item) => `${item.label} (${item.reason})`).join(' ; ')}.
              </p>
            )}
            <button type="button" onClick={() => setPrefillReport(null)} className={`${buttonSecondary} min-h-[44px] self-start bg-white`}>
              Masquer ce message
            </button>
          </section>
        )}

        {canImport && (
          <section aria-label="Importer un contrat" className="flex flex-col gap-sm rounded bg-soft-cloud p-md">
            <p className="font-body-sm text-body-sm">Vous avez votre contrat ou votre offre de prêt sous la main ? Les informations lisibles vous sont proposées, et vous vérifiez tout avant d’enregistrer.</p>
            <button type="button" onClick={() => setView('import')} className={`${buttonSecondary} w-full bg-white`}>
              <UploadIcon width={20} height={20} />
              Importer depuis un contrat (PDF ou photo)
            </button>
          </section>
        )}

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

        <div>
          <label htmlFor="debt-lender" className={labelClass}>
            Prêteur (facultatif)
          </label>
          <input
            id="debt-lender"
            type="text"
            list="debt-lender-options"
            maxLength={MAX_LENDER_LENGTH}
            autoComplete="off"
            placeholder="Ma banque"
            value={values.lender}
            onChange={(event) => set('lender', event.target.value)}
            aria-invalid={errors.lender ? true : undefined}
            aria-describedby={errors.lender ? 'debt-lender-error' : 'debt-lender-hint'}
            className={inputClass}
          />
          {lenders.length > 0 && (
            <datalist id="debt-lender-options" data-testid="lender-options">
              {lenders.map((lender) => (
                <option key={lender} value={lender} />
              ))}
            </datalist>
          )}
          {hint('debt-lender-hint', 'La banque ou l’organisme qui vous a prêté l’argent. Cela permet de regrouper vos crédits par prêteur.')}
          <FieldError id="debt-lender-error" message={errors.lender} />
          <PrefillMark confidence={marks.lender} />
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
          <PrefillMark confidence={marks.principal} />
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
          <PrefillMark confidence={marks.rate} />
        </div>

        <div role="group" aria-label="Type de taux" aria-describedby="debt-rate-type-hint">
          <span className={labelClass}>Type de taux (facultatif)</span>
          <div className="grid grid-cols-2 gap-sm min-[420px]:grid-cols-4">
            {([['', RATE_TYPE_UNKNOWN_LABEL], ...RATE_TYPES.map((type) => [type, RATE_TYPE_LABEL[type]] as const)] as const).map(([type, label]) => (
              <button
                key={type || 'unknown'}
                type="button"
                aria-pressed={values.rateType === type}
                onClick={() => set('rateType', type)}
                className={`flex min-h-[48px] items-center justify-center rounded-full border-2 px-sm font-button-md text-body-sm font-semibold leading-tight ${
                  values.rateType === type ? 'border-ink bg-ink text-surface' : 'border-hairline bg-white text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {hint('debt-rate-type-hint', RATE_TYPE_HELP)}
          <PrefillMark confidence={marks.rateType} />
          {warning && (
            <p role="status" className="mt-sm flex items-start gap-sm rounded border border-plaisir/50 bg-plaisir/10 p-md font-body-sm text-body-sm">
              <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
              {warning}
            </p>
          )}
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
          <PrefillMark confidence={marks.monthlyPayment} />
        </div>

        <div role="group" aria-label="Durée initiale du prêt">
          <span className={labelClass}>Durée initiale du prêt (facultatif)</span>
          <div className="mb-sm grid grid-cols-2 gap-sm">
            {([['MONTHS', 'En mois'], ['YEARS', 'En années et mois']] as const).map(([unit, label]) => (
              <button
                key={unit}
                type="button"
                aria-pressed={values.termUnit === unit}
                onClick={() => set('termUnit', unit as TermUnit)}
                className={`flex min-h-[48px] items-center justify-center rounded-full border-2 px-sm font-button-md text-body-sm font-semibold leading-tight ${
                  values.termUnit === unit ? 'border-ink bg-ink text-surface' : 'border-hairline bg-white text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {values.termUnit === 'MONTHS' ? (
            <div>
              <label htmlFor="debt-term-months" className="sr-only">
                Durée en mois
              </label>
              <NumberInput
                id="debt-term-months"
                unit="mois"
                inputMode="numeric"
                value={values.termMonths}
                onChange={(value) => set('termMonths', value)}
                invalid={Boolean(errors.term)}
                describedBy={errors.term ? 'debt-term-error' : 'debt-term-hint'}
                placeholder="240"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label htmlFor="debt-term-years" className="sr-only">
                  Durée : années
                </label>
                <NumberInput
                  id="debt-term-years"
                  unit="ans"
                  inputMode="numeric"
                  value={values.termYears}
                  onChange={(value) => set('termYears', value)}
                  invalid={Boolean(errors.term)}
                  describedBy={errors.term ? 'debt-term-error' : 'debt-term-hint'}
                  placeholder="20"
                />
              </div>
              <div>
                <label htmlFor="debt-term-extra" className="sr-only">
                  Durée : mois en plus
                </label>
                <NumberInput
                  id="debt-term-extra"
                  unit="mois"
                  inputMode="numeric"
                  value={values.termExtraMonths}
                  onChange={(value) => set('termExtraMonths', value)}
                  invalid={Boolean(errors.term)}
                  describedBy={errors.term ? 'debt-term-error' : 'debt-term-hint'}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          {hint('debt-term-hint', 'La durée prévue à la signature du prêt (elle figure sur l’offre de prêt). Elle sert à vérifier que la mensualité est cohérente.')}
          <FieldError id="debt-term-error" message={errors.term} />
          <PrefillMark confidence={marks.term} />
        </div>

        <fieldset className="flex flex-col gap-lg rounded border border-hairline p-md">
          <legend className="px-1 font-label-caps text-label-caps uppercase text-mute">Assurance emprunteur</legend>
          <div>
            <label htmlFor="debt-insurance-mode" className={labelClass}>
              Comment l’assurance est-elle calculée ?
            </label>
            <select id="debt-insurance-mode" value={values.insuranceMode} onChange={(event) => set('insuranceMode', event.target.value as typeof values.insuranceMode)} className={inputClass}>
              {INSURANCE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {INSURANCE_MODE_LABEL[mode]}
                </option>
              ))}
            </select>
            <PrefillMark confidence={marks.insuranceMode} />
          </div>

          {percentInsurance ? (
            <>
              <div>
                <label htmlFor="debt-insurance-rate" className={labelClass}>
                  Taux annuel de l’assurance
                </label>
                <NumberInput
                  id="debt-insurance-rate"
                  unit="%"
                  value={values.insuranceRate}
                  onChange={(value) => set('insuranceRate', value)}
                  invalid={Boolean(errors.insuranceRate)}
                  describedBy={errors.insuranceRate ? 'debt-insurance-rate-error' : 'debt-insurance-rate-hint'}
                  placeholder="0,30"
                />
                {hint(
                  'debt-insurance-rate-hint',
                  values.insuranceMode === 'PERCENT_INITIAL'
                    ? 'Appliqué au capital emprunté : l’assurance reste la même chaque mois.'
                    : 'Appliqué au capital restant dû : l’assurance baisse au fil des remboursements.',
                )}
                <FieldError id="debt-insurance-rate-error" message={errors.insuranceRate} />
                <PrefillMark confidence={marks.insuranceRate} />
              </div>
              <div>
                <label htmlFor="debt-insurance-quotity" className={labelClass}>
                  Quotité assurée
                </label>
                <NumberInput
                  id="debt-insurance-quotity"
                  unit="%"
                  inputMode="numeric"
                  value={values.insuranceQuotity}
                  onChange={(value) => set('insuranceQuotity', value)}
                  invalid={Boolean(errors.insuranceQuotity)}
                  describedBy={errors.insuranceQuotity ? 'debt-insurance-quotity-error' : 'debt-insurance-quotity-hint'}
                  placeholder="100"
                />
                {hint('debt-insurance-quotity-hint', QUOTITY_HELP)}
                <FieldError id="debt-insurance-quotity-error" message={errors.insuranceQuotity} />
              </div>
            </>
          ) : (
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
              <PrefillMark confidence={marks.insurance} />
            </div>
          )}
        </fieldset>

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
          <PrefillMark confidence={marks.startDate} />
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

        <details
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          className="group rounded border border-hairline"
          data-testid="contract-details"
        >
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-md px-md font-body-md text-body-md font-semibold">
            <span>Frais, garantie et notes (facultatif)</span>
            <ChevronRightIcon width={20} height={20} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="flex flex-col gap-lg p-md pt-sm">
            <div>
              <label htmlFor="debt-reference" className={labelClass}>
                Référence du contrat
              </label>
              <input
                id="debt-reference"
                type="text"
                maxLength={MAX_CONTRACT_REFERENCE_LENGTH}
                autoComplete="off"
                value={values.contractReference}
                onChange={(event) => set('contractReference', event.target.value)}
                aria-invalid={errors.contractReference ? true : undefined}
                aria-describedby={errors.contractReference ? 'debt-reference-error' : undefined}
                className={inputClass}
              />
              <FieldError id="debt-reference-error" message={errors.contractReference} />
              <PrefillMark confidence={marks.contractReference} />
            </div>

            <div>
              <label htmlFor="debt-fees" className={labelClass}>
                Frais de dossier
              </label>
              <NumberInput
                id="debt-fees"
                value={values.fees}
                onChange={(value) => set('fees', value)}
                invalid={Boolean(errors.fees)}
                describedBy={errors.fees ? 'debt-fees-error' : undefined}
                placeholder="900"
              />
              <FieldError id="debt-fees-error" message={errors.fees} />
              <PrefillMark confidence={marks.fees} />
            </div>

            <div>
              <label htmlFor="debt-guarantee-kind" className={labelClass}>
                Garantie
              </label>
              <select id="debt-guarantee-kind" value={values.guaranteeKind} onChange={(event) => set('guaranteeKind', event.target.value as typeof values.guaranteeKind)} className={inputClass}>
                {GUARANTEE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {GUARANTEE_KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
              <PrefillMark confidence={marks.guaranteeKind} />
            </div>

            <div>
              <label htmlFor="debt-guarantee" className={labelClass}>
                Frais de garantie
              </label>
              <NumberInput
                id="debt-guarantee"
                value={values.guarantee}
                onChange={(value) => set('guarantee', value)}
                invalid={Boolean(errors.guarantee)}
                describedBy={errors.guarantee ? 'debt-guarantee-error' : 'debt-guarantee-hint'}
                placeholder="1 500"
              />
              {hint('debt-guarantee-hint', 'Le coût de la caution ou de l’hypothèque, s’il y en a un. Choisissez d’abord le type de garantie.')}
              <FieldError id="debt-guarantee-error" message={errors.guarantee} />
              <PrefillMark confidence={marks.guarantee} />
            </div>

            <div>
              <label htmlFor="debt-notes" className={labelClass}>
                Notes
              </label>
              <textarea
                id="debt-notes"
                rows={4}
                maxLength={MAX_NOTES_LENGTH}
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
                aria-invalid={errors.notes ? true : undefined}
                aria-describedby={errors.notes ? 'debt-notes-error' : 'debt-notes-hint debt-notes-count'}
                className={`${inputClass} py-sm`}
              />
              {hint('debt-notes-hint', NOTES_HELP)}
              <p id="debt-notes-count" className="tabular mt-1 text-right font-body-sm text-body-sm text-mute" data-testid="notes-count">
                {values.notes.length} / {MAX_NOTES_LENGTH} caractères
              </p>
              <FieldError id="debt-notes-error" message={errors.notes} />
            </div>
          </div>
        </details>

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
