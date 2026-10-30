import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useAccounts } from '../../application/use-accounts';
import { useAidRules } from '../../application/use-aid-rules';
import { useForecast } from '../../application/use-forecast';
import { useRecurring } from '../../application/use-recurring';
import { useSelectedMonth } from '../../application/use-selected-month';
import { useSpace } from '../../application/use-space';
import { RecurringPayload, RecurringPayment } from '../../domain/recurring';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { BalanceHero } from '../components/forecast/BalanceHero';
import { ForecastBlocs } from '../components/forecast/ForecastBlocs';
import { ForecastOccurrences } from '../components/forecast/ForecastOccurrences';
import { LoadingScreen } from '../components/LoadingScreen';
import { MonthPicker } from '../components/MonthPicker';
import { RecurringForm } from '../components/recurring/RecurringForm';
import { RecurringList } from '../components/recurring/RecurringList';
import { useToast } from '../components/Toast';
import { cardClass } from '../components/ui';

type SheetState = { editing: RecurringPayment | null } | null;

export function PrevisionnelPage() {
  const { space, kind } = useSpace();
  const { month, setMonth } = useSelectedMonth();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const refreshForecast = useCallback(() => setVersion((value) => value + 1), []);

  const forecast = useForecast(space.id, month, version);
  const recurring = useRecurring(space.id, refreshForecast);
  const isCommon = kind === 'COMMON';
  const aidRules = useAidRules(isCommon);
  const { accounts, hasSelectableAccount, defaultAccountId, rememberAccount, nameOf } = useAccounts();

  const offline = isOfflineError(forecast.error) || isOfflineError(recurring.error);
  const retry = () => {
    forecast.reload();
    recurring.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const closeSheet = useCallback(() => setSheet(null), []);

  const handleSubmit = async (payload: RecurringPayload) => {
    const editing = sheet?.editing ?? null;
    try {
      if (editing) {
        await recurring.update(editing.id, payload);
        toast.show('Paiement modifié');
      } else {
        await recurring.create(payload);
        if (hasSelectableAccount) {
          rememberAccount(payload.accountId ?? null);
        }
        toast.show('Paiement ajouté');
      }
    } catch (error) {
      throw new Error(describeError(error, 'L’enregistrement a échoué. Vérifiez les informations et réessayez.'));
    }
    closeSheet();
  };

  const handleToggle = async (item: RecurringPayment, active: boolean) => {
    try {
      await recurring.setActive(item, active);
      toast.show(active ? 'Paiement réactivé' : 'Paiement mis en pause');
    } catch (error) {
      toast.show(describeError(error, 'Modification impossible.'), 'error');
    }
  };

  const handleDelete = async (item: RecurringPayment) => {
    try {
      await recurring.remove(item.id);
      toast.show('Paiement supprimé');
    } catch (error) {
      toast.show(describeError(error, 'Suppression impossible.'), 'error');
    }
  };

  return (
    <>
      <div>
        <h2 className="font-heading-lg text-heading-lg">Prévisionnel</h2>
        <p className="font-body-sm text-body-sm text-mute">Où en sera le budget à la fin du mois ?</p>
      </div>
      <MonthPicker month={month} onChange={setMonth} />

      {forecast.data ? (
        <>
          <BalanceHero forecast={forecast.data} />
          <ForecastBlocs forecast={forecast.data} />
          <ForecastOccurrences occurrences={forecast.data.occurrences} />
        </>
      ) : offline ? (
        <OfflineNotice message="Hors ligne : le prévisionnel reviendra avec le réseau." onRetry={retry} />
      ) : forecast.error ? (
        <ErrorNotice message={describeError(forecast.error, 'Impossible de calculer le prévisionnel.')} onRetry={forecast.reload} />
      ) : (
        <LoadingScreen />
      )}

      {recurring.items ? (
        <RecurringList
          items={recurring.items}
          aidRules={aidRules.rules}
          accountNameOf={nameOf}
          busy={recurring.saving}
          onAdd={() => setSheet({ editing: null })}
          onEdit={(item) => setSheet({ editing: item })}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      ) : offline ? null : recurring.error ? (
        <ErrorNotice message={describeError(recurring.error, 'Impossible de charger les paiements récurrents.')} onRetry={recurring.reload} />
      ) : (
        <LoadingScreen />
      )}

      {isCommon && (
        <section className={`${cardClass} flex flex-col gap-sm`}>
          <h3 className="font-label-caps text-label-caps uppercase text-mute">Aides officielles</h3>
          <p className="font-body-sm text-body-sm text-mute">
            Garde d’enfants, ménage à domicile… une partie de certaines dépenses vous revient en crédit d’impôt.
          </p>
          <Link to="/aides" className="inline-flex min-h-[44px] items-center font-body-md text-body-md font-semibold underline">
            Voir mes aides et estimer une crèche
          </Link>
        </section>
      )}

      {sheet && (
        <RecurringForm
          key={sheet.editing?.id ?? 'new'}
          editing={sheet.editing}
          allowAid={isCommon}
          aidRules={aidRules.rules}
          accounts={accounts}
          defaultAccountId={defaultAccountId()}
          onClose={closeSheet}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
