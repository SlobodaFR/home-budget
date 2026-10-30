import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useSpace } from '../../application/use-space';
import { useTrends } from '../../application/use-trends';
import {
  DEFAULT_TREND_WINDOW,
  describeAverageSavings,
  describeSavingsSentence,
  hasAnyActivity,
  longMonthLabel,
  TREND_WINDOWS,
  TrendWindow,
  windowLabel,
} from '../../domain/trends';
import { formatCentsRounded } from '../../domain/money';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { BalanceChart, IncomeExpenseChart, TrendsTable } from '../components/trends/TrendsCharts';
import { RisersSection, TopLabelsList } from '../components/trends/TrendsLists';
import { cardClass } from '../components/ui';

export function TendancesPage() {
  const { space, kind } = useSpace();
  const [months, setMonths] = useState<TrendWindow>(DEFAULT_TREND_WINDOW);
  const trends = useTrends(space.id, months);

  const offline = isOfflineError(trends.error);
  const { reload } = trends;
  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [offline, reload]);

  const data = trends.data;

  return (
    <>
      <div>
        <Link to="/" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Accueil
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Tendances {kind === 'COMMON' ? 'communes' : 'perso'}</h2>
        <p className="font-body-sm text-body-sm text-mute">Où va l’argent, et est-ce que ça change ? Les derniers mois de l’espace « {space.name} », sans rien à saisir.</p>
      </div>

      <div role="group" aria-label="Période observée" className="grid grid-cols-3 rounded-full bg-soft-cloud p-1">
        {TREND_WINDOWS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={months === value}
            onClick={() => setMonths(value)}
            className={`min-h-[48px] rounded-full px-sm font-button-md text-body-sm font-semibold ${months === value ? 'bg-ink text-surface' : 'text-ink'}`}
          >
            {windowLabel(value)}
          </button>
        ))}
      </div>

      {data ? (
        !hasAnyActivity(data) ? (
          <section aria-label="Pas encore de tendances" className={`${cardClass} flex flex-col items-start gap-md`}>
            <h3 className="font-heading-lg text-heading-lg">Pas encore de tendances</h3>
            <p className="font-body-md text-body-md">Aucune opération n’a été enregistrée sur cette période. Dès que vous aurez importé ou saisi quelques mois, vous verrez ici où va votre argent.</p>
            <Link to="/import" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
              Importer un relevé
            </Link>
          </section>
        ) : (
          <>
            <section aria-label="Taux d’épargne moyen" className={cardClass}>
              <p className="font-label-caps text-label-caps uppercase text-mute">Taux d’épargne moyen</p>
              <p className="tabular font-heading-xl text-heading-xl">{describeAverageSavings(data.averages)}</p>
              <p className="font-body-sm text-body-sm" data-testid="savings-sentence">
                {describeSavingsSentence(data.averages, data.months.length)}
              </p>
              <dl className="mt-md grid grid-cols-2 gap-md border-t border-hairline-soft pt-md">
                <div>
                  <dt className="font-label-caps text-label-caps uppercase text-mute">Revenus par mois</dt>
                  <dd className="tabular font-body-md text-body-md font-semibold">{formatCentsRounded(data.averages.incomeCents)}</dd>
                </div>
                <div>
                  <dt className="font-label-caps text-label-caps uppercase text-mute">Dépenses par mois</dt>
                  <dd className="tabular font-body-md text-body-md font-semibold">{formatCentsRounded(data.averages.expenseCents)}</dd>
                </div>
              </dl>
              <p className="mt-1 font-body-sm text-body-sm text-mute">Moyennes sur {data.months.length} mois, de {longMonthLabel(data.from)} à {longMonthLabel(data.to)}.</p>
            </section>

            <section aria-label="Évolution mois par mois" className={`${cardClass} flex flex-col gap-lg`}>
              <div>
                <h3 className="font-label-caps text-label-caps uppercase text-mute">Revenus et dépenses</h3>
                <div className="mt-sm">
                  <IncomeExpenseChart months={data.months} />
                </div>
              </div>
              <div className="border-t border-hairline-soft pt-md">
                <h3 className="font-label-caps text-label-caps uppercase text-mute">Solde de chaque mois</h3>
                <div className="mt-sm">
                  <BalanceChart months={data.months} />
                </div>
              </div>
            </section>
            <TrendsTable months={data.months} />

            <TopLabelsList items={data.topLabels} />
            <RisersSection items={data.risers} monthsCount={data.months.length} />
          </>
        )
      ) : offline ? (
        <OfflineNotice message="Hors ligne : vos tendances reviendront avec le réseau." onRetry={reload} />
      ) : trends.error ? (
        <ErrorNotice message={describeError(trends.error, 'Impossible de charger les tendances.')} onRetry={reload} />
      ) : (
        <LoadingScreen />
      )}
    </>
  );
}
