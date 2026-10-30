import { describeBalanceGap, Forecast } from '../../../domain/forecast';
import { formatCents } from '../../../domain/money';
import { formatDay } from '../../../domain/month';
import { cardClass } from '../ui';

function Balance({ label, hint, cents, big }: { label: string; hint: string; cents: number; big?: boolean }) {
  return (
    <div>
      <p className="font-label-caps text-label-caps uppercase text-mute">{label}</p>
      <p className={`tabular ${big ? 'font-heading-xl text-heading-xl' : 'font-heading-lg text-heading-lg'} ${cents < 0 ? 'text-error' : 'text-ink'}`}>
        {formatCents(cents)}
      </p>
      <p className="font-body-sm text-body-sm text-mute">{hint}</p>
    </div>
  );
}

export function BalanceHero({ forecast }: { forecast: Forecast }) {
  return (
    <section aria-label="Soldes de fin de mois" className={`${cardClass} flex flex-col gap-md`}>
      <Balance
        big
        label="Solde projeté"
        cents={forecast.projectedBalanceCents}
        hint="Ce que l’on sait déjà : vos opérations et les paiements récurrents à venir."
      />
      <div className="border-t border-hairline-soft pt-md">
        <Balance
          label="Solde prudent"
          cents={forecast.cautiousBalanceCents}
          hint="Si vous dépensez au moins le prévu dans chaque bloc."
        />
      </div>
      <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">{describeBalanceGap(forecast)}</p>
      <p className="font-body-sm text-body-sm text-mute">Situation au {formatDay(forecast.asOf)}</p>
    </section>
  );
}
