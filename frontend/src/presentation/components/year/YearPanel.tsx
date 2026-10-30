import { useState } from 'react';
import { describeError, isOfflineError } from '../../../application/error-message';
import { useYearForecast } from '../../../application/use-year-forecast';
import { ChevronLeftIcon, ChevronRightIcon } from '../Icons';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { LoadingScreen } from '../LoadingScreen';
import { YearView } from './YearView';

const stepButton = 'flex h-11 w-11 items-center justify-center rounded-full border border-hairline-soft bg-white hover:bg-soft-cloud';

interface Props {
  spaceId: string;
  initialYear: number;
  refreshToken: number;
}

export function YearPanel({ spaceId, initialYear, refreshToken }: Props) {
  const [year, setYear] = useState(initialYear);
  const forecast = useYearForecast(spaceId, year, refreshToken);

  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Année précédente" className={stepButton} onClick={() => setYear((value) => value - 1)}>
          <ChevronLeftIcon />
        </button>
        <h3 className="font-heading-lg text-heading-lg" aria-live="polite">
          {year}
        </h3>
        <button type="button" aria-label="Année suivante" className={stepButton} onClick={() => setYear((value) => value + 1)}>
          <ChevronRightIcon />
        </button>
      </div>
      {forecast.data ? (
        <YearView forecast={forecast.data} />
      ) : isOfflineError(forecast.error) ? (
        <OfflineNotice message="Hors ligne : la vue de l’année reviendra avec le réseau." onRetry={forecast.reload} />
      ) : forecast.error ? (
        <ErrorNotice message={describeError(forecast.error, 'Impossible de calculer la vue de l’année.')} onRetry={forecast.reload} />
      ) : (
        <LoadingScreen />
      )}
    </>
  );
}
