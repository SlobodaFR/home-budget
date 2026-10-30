import { FormEvent, useState } from 'react';
import { useSafetyNet } from '../../application/use-safety-net';
import { formatCents } from '../../domain/money';
import { formatLongDateInput } from '../../domain/month';
import {
  buildSafetyNetPayload,
  formatMonthsCount,
  MAX_TARGET_MONTHS,
  MIN_TARGET_MONTHS,
  SafetyNet,
  SafetyNetFormErrors,
  SafetyNetProgress,
  safetyNetCoverage,
  safetyNetToForm,
} from '../../domain/safety-net';
import { describeError } from '../../application/error-message';
import { ErrorNotice } from './ErrorNotice';
import { LoadingScreen } from './LoadingScreen';
import { useToast } from './Toast';
import { buttonPrimary, cardClass, inputClass, labelClass } from './ui';

function Progress({ safetyNet, progress }: { safetyNet: SafetyNet; progress: SafetyNetProgress | null }) {
  const coverage = safetyNetCoverage(safetyNet, progress);
  return (
    <div className="flex flex-col gap-sm" data-testid="safety-net-progress">
      <p className="tabular font-heading-xl text-heading-xl">{formatCents(coverage.currentCents)}</p>
      <p className="font-body-sm text-body-sm text-mute">
        {coverage.addedCents > 0
          ? `dont ${formatCents(coverage.addedCents)} versés depuis le ${formatLongDateInput(safetyNet.asOf)}`
          : `au ${formatLongDateInput(safetyNet.asOf)}`}
      </p>
      {coverage.coveredMonths === null ? (
        <p className="font-body-sm text-body-sm">
          Objectif : couvrir {safetyNet.targetMonths} mois de dépenses.
          {progress ? ' Renseignez le plan commun pour voir où vous en êtes.' : ''}
        </p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label="Épargne de sécurité"
            aria-valuemin={0}
            aria-valuemax={safetyNet.targetMonths}
            aria-valuenow={Math.min(coverage.coveredMonths, safetyNet.targetMonths)}
            aria-valuetext={`${formatMonthsCount(coverage.coveredMonths)} couverts sur ${safetyNet.targetMonths}`}
            className="h-3 overflow-hidden rounded-full bg-soft-cloud"
          >
            <div className={`h-full ${coverage.reached ? 'bg-success' : 'bg-epargne'}`} style={{ width: `${coverage.ratio * 100}%` }} />
          </div>
          <p className="font-body-sm text-body-sm">
            <span className="font-semibold">{formatMonthsCount(coverage.coveredMonths)}</span> de dépenses couverts sur {safetyNet.targetMonths} visés
            {coverage.reached ? ' : objectif atteint.' : '.'}
          </p>
          {coverage.monthlyBasisCents !== null && coverage.monthlyBasisCents > 0 && (
            <p className="font-body-sm text-body-sm text-mute">
              Calculé sur vos dépenses mensuelles de référence ({formatCents(coverage.monthlyBasisCents)} par mois).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SafetyNetForm({ initial, saving, onSave }: { initial: SafetyNet | null; saving: boolean; onSave: (payload: SafetyNet) => Promise<void> }) {
  const [values, setValues] = useState(() => safetyNetToForm(initial));
  const [errors, setErrors] = useState<SafetyNetFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = buildSafetyNetPayload(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    try {
      await onSave(result.payload);
    } catch (error) {
      setSubmitError(describeError(error, 'Enregistrement impossible, réessayez.'));
    }
  };

  const hint = (id: string, text: string, error?: string) => (
    <p id={id} role={error ? 'alert' : undefined} className={`mt-1 font-body-sm text-body-sm ${error ? 'text-error' : 'text-mute'}`}>
      {error ?? text}
    </p>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
      <div>
        <label htmlFor="safety-saved" className={labelClass}>
          Montant épargné
        </label>
        <div className="relative">
          <input
            id="safety-saved"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="5 500"
            value={values.saved}
            onChange={(event) => setValues((previous) => ({ ...previous, saved: event.target.value }))}
            aria-invalid={errors.saved ? true : undefined}
            aria-describedby="safety-saved-hint"
            className={`${inputClass} tabular pr-10 text-right`}
          />
          <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
        </div>
        {hint('safety-saved-hint', 'Ce qui est disponible, de côté, pour les coups durs (livret…).', errors.saved)}
      </div>
      <div>
        <label htmlFor="safety-date" className={labelClass}>
          À la date du
        </label>
        <input
          id="safety-date"
          type="date"
          value={values.asOf}
          onChange={(event) => setValues((previous) => ({ ...previous, asOf: event.target.value }))}
          aria-invalid={errors.asOf ? true : undefined}
          aria-describedby="safety-date-hint"
          className={inputClass}
        />
        {hint('safety-date-hint', 'Ensuite, ce que vous versez dans le bloc Épargne du commun s’ajoute tout seul.', errors.asOf)}
      </div>
      <div>
        <label htmlFor="safety-months" className={labelClass}>
          Objectif en mois de dépenses
        </label>
        <div className="relative">
          <input
            id="safety-months"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={values.targetMonths}
            onChange={(event) => setValues((previous) => ({ ...previous, targetMonths: event.target.value }))}
            aria-invalid={errors.targetMonths ? true : undefined}
            aria-describedby="safety-months-hint"
            className={`${inputClass} tabular pr-16 text-right`}
          />
          <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">mois</span>
        </div>
        {hint(
          'safety-months-hint',
          `Combien de mois de dépenses voulez-vous pouvoir couvrir sans revenu ? De ${MIN_TARGET_MONTHS} à ${MAX_TARGET_MONTHS}.`,
          errors.targetMonths,
        )}
      </div>
      {submitError && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {submitError}
        </p>
      )}
      <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
        {saving ? 'Enregistrement…' : 'Enregistrer l’épargne'}
      </button>
    </form>
  );
}

export function SafetyNetSection() {
  const { state, error, reload, saving, save } = useSafetyNet();
  const toast = useToast();

  const handleSave = async (payload: SafetyNet) => {
    await save(payload);
    toast.show('Épargne de sécurité enregistrée');
  };

  return (
    <section className={`${cardClass} flex flex-col gap-md`}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Épargne de sécurité</h3>
      <p className="font-body-sm text-body-sm text-mute">
        Une réserve pour les imprévus, partagée par tout le foyer. Voir la leçon 2 du cours pour savoir combien viser.
      </p>
      {error ? (
        <ErrorNotice message={describeError(error, 'Impossible de charger l’épargne de sécurité.')} onRetry={reload} />
      ) : state === undefined ? (
        <LoadingScreen />
      ) : (
        <>
          {state.safetyNet && <Progress safetyNet={state.safetyNet} progress={state.progress} />}
          <div className={state.safetyNet ? 'border-t border-hairline-soft pt-md' : ''}>
            <SafetyNetForm
              key={state.safetyNet ? `${state.safetyNet.savedCents}-${state.safetyNet.asOf}-${state.safetyNet.targetMonths}` : 'empty'}
              initial={state.safetyNet}
              saving={saving}
              onSave={handleSave}
            />
          </div>
        </>
      )}
    </section>
  );
}
