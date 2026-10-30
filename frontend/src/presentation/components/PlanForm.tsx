import { FormEvent, useMemo, useState } from 'react';
import { BLOC_INFO, BLOCS, Bloc } from '../../domain/bloc';
import { Plan, PLAN_BLOC_FIELDS, planTotals } from '../../domain/budget';
import { centsToInputValue, formatCents, parseAmountToCents } from '../../domain/money';
import { BLOC_STYLE } from './bloc-style';
import { buttonPrimary, cardClass, inputClass } from './ui';

type FieldKey = 'income' | Bloc;
type Values = Record<FieldKey, string>;

const FIELD_ORDER: FieldKey[] = ['income', ...BLOCS];

function toValues(plan: Plan): Values {
  return {
    income: centsToInputValue(plan.incomeCents),
    FIXE: centsToInputValue(plan.fixeCents),
    COURANT: centsToInputValue(plan.courantCents),
    PLAISIR: centsToInputValue(plan.plaisirCents),
    EPARGNE: centsToInputValue(plan.epargneCents),
  };
}

function parseValues(values: Values): { plan: Plan; invalid: FieldKey[] } {
  const invalid: FieldKey[] = [];
  const read = (key: FieldKey) => {
    const text = values[key].trim();
    const cents = text === '' ? 0 : parseAmountToCents(text);
    if (cents === null) {
      invalid.push(key);
      return 0;
    }
    return cents;
  };
  const plan = {
    incomeCents: read('income'),
    fixeCents: read('FIXE'),
    courantCents: read('COURANT'),
    plaisirCents: read('PLAISIR'),
    epargneCents: read('EPARGNE'),
  };
  return { plan, invalid };
}

interface Props {
  initial: Plan;
  saving: boolean;
  isCommon: boolean;
  onSave: (plan: Plan) => Promise<boolean>;
}

function BalanceMessage({ status, balanceCents }: { status: ReturnType<typeof planTotals>['status']; balanceCents: number }) {
  if (status === 'unassigned') {
    return (
      <p className="rounded border border-plaisir/40 bg-plaisir/10 p-md font-body-sm text-body-sm">
        <span className="font-semibold">{formatCents(balanceCents)} sans rôle.</span> Donnez-leur une place dans un bloc : pourquoi pas dans l’Épargne ?
      </p>
    );
  }
  if (status === 'overcommitted') {
    return (
      <p role="alert" className="rounded border border-error/30 bg-error/5 p-md font-body-sm text-body-sm text-error">
        <span className="font-semibold">Le plan dépasse les revenus de {formatCents(-balanceCents)}.</span> Réduisez un bloc ou revoyez le revenu prévu.
      </p>
    );
  }
  return <p className="rounded border border-success/30 bg-success/5 p-md font-body-sm text-body-sm text-success">Chaque euro a un rôle.</p>;
}

function AllocationBar({ plan }: { plan: Plan }) {
  const { blocsCents, balanceCents } = planTotals(plan);
  const total = Math.max(plan.incomeCents, blocsCents);
  if (total <= 0) {
    return null;
  }
  return (
    <div role="img" aria-label="Répartition du revenu prévu entre les blocs" className="flex h-4 overflow-hidden rounded-full bg-soft-cloud">
      {BLOCS.map((bloc) => (
        <div key={bloc} className={BLOC_STYLE[bloc].bar} style={{ width: `${(plan[PLAN_BLOC_FIELDS[bloc]] / total) * 100}%` }} />
      ))}
      {balanceCents > 0 && <div className="bg-hairline" style={{ width: `${(balanceCents / total) * 100}%` }} />}
    </div>
  );
}

export function PlanForm({ initial, saving, isCommon, onSave }: Props) {
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [submitted, setSubmitted] = useState(false);
  const { plan, invalid } = useMemo(() => parseValues(values), [values]);
  const totals = planTotals(plan);
  const initialValues = useMemo(() => toValues(initial), [initial]);
  const dirty = FIELD_ORDER.some((key) => values[key].trim() !== initialValues[key]);

  const update = (key: FieldKey, value: string) => {
    setSubmitted(false);
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (invalid.length > 0) {
      return;
    }
    if (await onSave(plan)) {
      setValues(toValues(plan));
    }
    setSubmitted(false);
  };

  const field = (key: FieldKey, label: string, hint: string, dot?: string) => (
    <div key={key}>
      <label htmlFor={`plan-${key}`} className="mb-1 flex items-center gap-sm font-body-md text-body-md font-semibold">
        {dot && <span className={`inline-block h-3 w-3 rounded-full ${dot}`} aria-hidden="true" />}
        {label}
      </label>
      <div className="relative">
        <input
          id={`plan-${key}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={values[key]}
          onChange={(event) => update(key, event.target.value)}
          aria-invalid={invalid.includes(key) ? true : undefined}
          aria-describedby={`plan-${key}-hint`}
          className={`${inputClass} tabular pr-10 text-right`}
        />
        <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
      </div>
      <p id={`plan-${key}-hint`} className={`mt-1 font-body-sm text-body-sm ${submitted && invalid.includes(key) ? 'text-error' : 'text-mute'}`}>
        {submitted && invalid.includes(key) ? 'Montant invalide (chiffres, 2 décimales au plus).' : hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
      {isCommon && (
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Le total des 4 blocs du plan commun sert de base au calcul de la contribution de chacun.
        </p>
      )}

      <section className={`${cardClass} flex flex-col gap-lg`}>
        {field('income', 'Revenus prévus', 'Ce qui rentre chaque mois dans cet espace.')}
      </section>

      <section className={`${cardClass} flex flex-col gap-lg`}>
        {BLOCS.map((bloc) => field(bloc, BLOC_INFO[bloc].label, BLOC_INFO[bloc].description, BLOC_STYLE[bloc].dot))}
      </section>

      <section aria-label="Totaux" className={`${cardClass} flex flex-col gap-md`}>
        <AllocationBar plan={plan} />
        <dl className="grid grid-cols-2 gap-md">
          <div>
            <dt className="font-label-caps text-label-caps uppercase text-mute">Total des blocs</dt>
            <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(totals.blocsCents)}</dd>
          </div>
          <div>
            <dt className="font-label-caps text-label-caps uppercase text-mute">Solde prévu</dt>
            <dd className={`tabular font-body-md text-body-md font-semibold ${totals.status === 'overcommitted' ? 'text-error' : ''}`}>
              {formatCents(totals.balanceCents)}
            </dd>
          </div>
        </dl>
        <BalanceMessage status={totals.status} balanceCents={totals.balanceCents} />
      </section>

      <button type="submit" disabled={saving || !dirty} className={`${buttonPrimary} w-full`}>
        {saving ? 'Enregistrement…' : dirty ? 'Enregistrer le plan' : 'Plan à jour'}
      </button>
    </form>
  );
}
