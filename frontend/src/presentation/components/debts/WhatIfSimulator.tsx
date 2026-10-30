import { FormEvent, useState } from 'react';
import { describeError, isOfflineError } from '../../../application/error-message';
import { useDebtWhatIf } from '../../../application/use-debt-what-if';
import {
  buildWhatIfQuery,
  Debt,
  describeScenarioDuration,
  describeScenarioEnd,
  describeScenarioInterest,
  describeWhatIfSavings,
  EMPTY_WHAT_IF_FORM,
  WhatIfFormErrors,
  WhatIfResult,
  WhatIfScenario,
} from '../../../domain/debt';
import { ApiError } from '../../../infrastructure/api-client';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { CheckIcon, InfoIcon } from '../Icons';
import { buttonPrimary, labelClass } from '../ui';
import { FieldError, NumberInput } from './fields';

function Scenario({ title, scenario, highlight }: { title: string; scenario: WhatIfScenario; highlight?: boolean }) {
  return (
    <div className={`min-w-0 rounded p-md ${highlight ? 'bg-success/10' : 'bg-soft-cloud'}`} data-testid={highlight ? 'what-if-scenario' : 'what-if-baseline'}>
      <h4 className="font-body-sm text-body-sm font-semibold">{title}</h4>
      <dl className="mt-sm flex flex-col gap-sm font-body-sm text-body-sm">
        <div>
          <dt className="text-mute">Durée restante</dt>
          <dd className="break-words font-semibold">{describeScenarioDuration(scenario)}</dd>
        </div>
        <div>
          <dt className="text-mute">Fin prévue</dt>
          <dd className="font-semibold">{describeScenarioEnd(scenario)}</dd>
        </div>
        <div>
          <dt className="text-mute">Intérêts restants</dt>
          <dd className="tabular font-semibold">{describeScenarioInterest(scenario)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Result({ result }: { result: WhatIfResult }) {
  return (
    <div className="flex flex-col gap-md" data-testid="what-if-result">
      <div className="grid grid-cols-1 gap-sm min-[400px]:grid-cols-2">
        <Scenario title="Aujourd’hui" scenario={result.baseline} />
        <Scenario title="Avec ce remboursement" scenario={result.scenario} highlight />
      </div>
      <p role="status" className="flex items-start gap-sm rounded bg-success/10 p-md font-body-md text-body-md font-semibold text-success">
        <CheckIcon width={20} height={20} className="mt-0.5 shrink-0" />
        {describeWhatIfSavings(result)}
      </p>
      <p role="note" aria-label="Indemnités de remboursement anticipé" className="flex items-start gap-sm rounded border border-plaisir/50 bg-plaisir/10 p-md font-body-sm text-body-sm">
        <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
        <span>
          <span className="font-semibold">À savoir : </span>
          {result.note}
        </span>
      </p>
      <p className="font-body-sm text-body-sm text-mute">Ce sont des estimations à partir du capital restant, du taux et de la mensualité que vous avez saisis.</p>
    </div>
  );
}

/** « Et si je remboursais plus vite ? » : compare la fin du crédit avec et sans effort supplémentaire. Rien n'est enregistré. */
export function WhatIfSimulator({ spaceId, debt }: { spaceId: string; debt: Debt }) {
  const { state, run, reset } = useDebtWhatIf(spaceId, debt.id);
  const [values, setValues] = useState(EMPTY_WHAT_IF_FORM);
  const [errors, setErrors] = useState<WhatIfFormErrors>({});

  const set = (key: 'extra' | 'lumpSum', value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors({});
    if (state.status === 'ready' || state.status === 'error') {
      reset();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const built = buildWhatIfQuery(values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors({});
    void run(built.query);
  };

  const retry = () => {
    if (state.status === 'error') {
      void run(state.query);
    }
  };

  return (
    <section aria-label="Simulateur de remboursement" className="flex flex-col gap-md">
      <div>
        <h3 className="font-heading-lg text-heading-lg">Et si je remboursais plus vite ?</h3>
        <p className="font-body-sm text-body-sm text-mute">Voyez ce que ça changerait. C’est une simulation : rien n’est modifié dans votre crédit.</p>
      </div>
      <form onSubmit={submit} noValidate aria-label="Simulation" className="flex flex-col gap-lg rounded bg-soft-cloud p-md">
        <div>
          <label htmlFor="what-if-extra" className={labelClass}>
            Versement supplémentaire par mois
          </label>
          <NumberInput
            id="what-if-extra"
            value={values.extra}
            onChange={(value) => set('extra', value)}
            invalid={Boolean(errors.extra || errors.both)}
            describedBy={errors.extra ? 'what-if-extra-error' : errors.both ? 'what-if-both-error' : undefined}
            placeholder="100"
          />
          <FieldError id="what-if-extra-error" message={errors.extra} />
        </div>
        <div>
          <label htmlFor="what-if-lump" className={labelClass}>
            Remboursement partiel immédiat
          </label>
          <NumberInput
            id="what-if-lump"
            value={values.lumpSum}
            onChange={(value) => set('lumpSum', value)}
            invalid={Boolean(errors.lumpSum || errors.both)}
            describedBy={errors.lumpSum ? 'what-if-lump-error' : errors.both ? 'what-if-both-error' : undefined}
            placeholder="2 000"
          />
          <FieldError id="what-if-lump-error" message={errors.lumpSum} />
        </div>
        <FieldError id="what-if-both-error" message={errors.both} />
        <button type="submit" disabled={state.status === 'loading'} className={`${buttonPrimary} w-full`}>
          {state.status === 'loading' ? 'Simulation en cours…' : 'Simuler'}
        </button>
      </form>

      <div aria-live="polite">
        {state.status === 'loading' && (
          <p role="status" className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
            Simulation en cours…
          </p>
        )}
        {state.status === 'error' &&
          (isOfflineError(state.error) ? (
            <OfflineNotice message="Hors ligne : la simulation a besoin du réseau. Vos montants sont conservés, réessayez dès son retour." onRetry={retry} />
          ) : (
            <ErrorNotice
              message={
                state.error instanceof ApiError && state.error.status === 400
                  ? 'La simulation n’a pas pu être faite : indiquez au moins un montant supérieur à 0.'
                  : describeError(state.error, 'La simulation a échoué. Réessayez dans un instant.')
              }
              onRetry={retry}
            />
          ))}
        {state.status === 'ready' && <Result result={state.result} />}
      </div>
    </section>
  );
}
