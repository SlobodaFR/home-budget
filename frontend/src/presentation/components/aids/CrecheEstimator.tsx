import { FormEvent, useState } from 'react';
import { useCrecheEstimate } from '../../../application/use-creche-estimate';
import {
  buildCrecheQuery,
  CrecheEstimate,
  CrecheFormErrors,
  describeCrecheLimits,
  describeVerification,
  EMPTY_CRECHE_FORM,
  formatEffortRate,
} from '../../../domain/aids';
import { ApiError } from '../../../infrastructure/api-client';
import { describeError } from '../../../application/error-message';
import { formatCents } from '../../../domain/money';
import { SourceLink } from './SourceLink';
import { buttonPrimary, inputClass } from '../ui';

function EstimateResult({ estimate }: { estimate: CrecheEstimate }) {
  const limits = describeCrecheLimits(estimate);
  return (
    <div role="status" aria-label="Résultat de l’estimation" className="flex flex-col gap-md rounded bg-soft-cloud p-md">
      <div>
        <p className="font-label-caps text-label-caps uppercase text-mute">Facture mensuelle estimée</p>
        <p className="tabular font-heading-xl text-heading-xl">{formatCents(estimate.monthlyBillCents)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-md">
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Tarif horaire</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(estimate.hourlyRateCents)}</dd>
        </div>
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Taux d’effort</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatEffortRate(estimate.effortRatePercent)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-body-sm text-body-sm text-mute">Ressources mensuelles retenues</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(estimate.monthlyResourcesUsedCents)}</dd>
        </div>
      </dl>
      {limits && <p className="rounded border border-plaisir/40 bg-plaisir/10 p-md font-body-sm text-body-sm">{limits}</p>}
      <p className="font-body-sm text-body-sm text-mute">
        Barème CNAF pour une crèche collective, {describeVerification(estimate.verifiedOn)}. Une crèche peut appliquer un plafond plus haut : le tarif
        réel figure dans votre contrat.
      </p>
      <SourceLink url={estimate.sourceUrl} verifiedOn={estimate.verifiedOn} />
    </div>
  );
}

export function CrecheEstimator() {
  const [values, setValues] = useState(EMPTY_CRECHE_FORM);
  const [errors, setErrors] = useState<CrecheFormErrors>({});
  const { estimate, error, loading, run } = useCrecheEstimate();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = buildCrecheQuery(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    void run(result.query);
  };

  const field = (
    id: keyof typeof EMPTY_CRECHE_FORM,
    label: string,
    hint: string,
    options: { suffix?: string; inputMode: 'decimal' | 'numeric'; placeholder?: string },
  ) => (
    <div>
      <label htmlFor={`creche-${id}`} className="mb-1 block font-body-md text-body-md font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={`creche-${id}`}
          type="text"
          inputMode={options.inputMode}
          autoComplete="off"
          placeholder={options.placeholder}
          value={values[id]}
          onChange={(event) => setValues((previous) => ({ ...previous, [id]: event.target.value }))}
          aria-invalid={errors[id] ? true : undefined}
          aria-describedby={`creche-${id}-hint`}
          className={`${inputClass} tabular text-right ${options.suffix ? 'pr-16' : ''}`}
        />
        {options.suffix && (
          <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">{options.suffix}</span>
        )}
      </div>
      <p id={`creche-${id}-hint`} role={errors[id] ? 'alert' : undefined} className={`mt-1 font-body-sm text-body-sm ${errors[id] ? 'text-error' : 'text-mute'}`}>
        {errors[id] ?? hint}
      </p>
    </div>
  );

  const failure = error
    ? error instanceof ApiError && error.status === 400
      ? 'Ces valeurs ne sont pas acceptées : vérifiez les montants et réessayez.'
      : describeError(error, 'Estimation impossible pour le moment, réessayez dans un instant.')
    : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
      {field('annualResources', 'Revenus annuels de l’année N-2', 'Le revenu imposable avant abattement, sur votre avis d’impôt (ex. en 2026 : revenus de 2024).', {
        suffix: '€',
        inputMode: 'decimal',
        placeholder: '42 000',
      })}
      {field('children', 'Nombre d’enfants à charge', 'Tous les enfants à charge de la famille, pas seulement celui en crèche.', { inputMode: 'numeric' })}
      {field('hoursPerMonth', 'Heures facturées par mois', 'Indiquées dans votre contrat avec la crèche (ex. 140).', {
        suffix: 'h',
        inputMode: 'decimal',
        placeholder: '140',
      })}
      <button type="submit" disabled={loading} className={`${buttonPrimary} w-full`}>
        {loading ? 'Calcul en cours…' : 'Estimer le tarif'}
      </button>
      {failure && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {failure}
        </p>
      )}
      {estimate && !loading && <EstimateResult estimate={estimate} />}
    </form>
  );
}
