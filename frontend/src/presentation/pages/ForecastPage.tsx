import { useState } from 'react';
import { useDashboard } from '../../application/use-dashboard';
import { useForecast } from '../../application/use-forecast';
import { RecurringTransaction } from '../../domain/recurring-transaction';
import { formatCents, formatSignedCents } from '../../domain/money';
import { apiClient } from '../../infrastructure/api-client';
import { RecurringTransactionFormModal } from '../components/RecurringTransactionFormModal';
import { RecurringTransactionRow } from '../components/RecurringTransactionRow';

type ModalState = { mode: 'create' } | { mode: 'edit'; recurringTransaction: RecurringTransaction } | null;

const OCCURRENCE_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long' });

function endOfCurrentMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function ForecastPage() {
  const { accounts } = useDashboard();
  const [targetDate, setTargetDate] = useState(endOfCurrentMonth);
  const { loading, error, forecast, recurringTransactions, refresh } = useForecast(targetDate);
  const [modal, setModal] = useState<ModalState>(null);

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  async function handleDelete(recurringTransaction: RecurringTransaction) {
    if (!window.confirm(`Supprimer le paiement recurrent "${recurringTransaction.label}" ?`)) {
      return;
    }
    await apiClient.deleteRecurringTransaction(recurringTransaction.id);
    void refresh();
  }

  return (
    <main className="px-margin-mobile md:px-margin-desktop py-section pb-32 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-md mb-xl">
        <h2 className="font-display-campaign text-display-campaign-mobile uppercase tracking-tighter text-ink">
          Previsionnel
        </h2>
        <label className="flex flex-col gap-sm">
          <span className="font-label-caps text-label-caps text-mute uppercase">Solde projete au</span>
          <input
            type="date"
            className="border border-hairline rounded px-md py-sm bg-surface"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </label>
      </div>

      {loading && !forecast && <p className="text-center text-mute py-xl">Chargement...</p>}
      {error && <p className="text-center text-error py-xl">Erreur : {error}</p>}

      {forecast && (
        <>
          <section className="mb-section">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
              {forecast.accounts.map((account) => (
                <div key={account.id} className="border border-hairline rounded-lg p-lg flex flex-col gap-sm">
                  <div className="flex items-center gap-sm">
                    <span className="material-symbols-outlined text-mute">{account.icon}</span>
                    <p className="font-label-caps text-label-caps text-mute uppercase">{account.name}</p>
                  </div>
                  <p className="font-body-sm text-body-sm text-mute">
                    Actuel : {formatCents(account.currentBalanceCents)}
                  </p>
                  <p className="font-heading-xl text-heading-xl text-ink">
                    {formatCents(account.projectedBalanceCents)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-md flex justify-between items-baseline">
              <p className="font-body-md text-body-md text-mute">
                Total actuel : {formatCents(forecast.totalCurrentBalanceCents)}
              </p>
              <p className="font-heading-xl text-heading-xl text-ink">
                Total projete : {formatCents(forecast.totalProjectedBalanceCents)}
              </p>
            </div>
          </section>

          <section className="mb-section">
            <h3 className="font-heading-xl text-heading-xl text-ink mb-md">A venir</h3>
            {forecast.upcomingOccurrences.length === 0 ? (
              <p className="py-xl text-center text-mute font-body-sm text-body-sm">
                Aucun paiement recurrent prevu d'ici cette date.
              </p>
            ) : (
              <div className="space-y-0 border-t border-hairline">
                {forecast.upcomingOccurrences.map((occurrence, index) => (
                  <div
                    key={`${occurrence.recurringTransactionId}-${occurrence.date}-${index}`}
                    className="flex items-center justify-between py-md border-b border-hairline-soft px-md"
                  >
                    <div>
                      <p className="font-body-md text-body-md text-ink">{occurrence.label}</p>
                      <p className="font-body-sm text-body-sm text-mute">
                        {OCCURRENCE_DATE_FORMATTER.format(new Date(occurrence.date))}
                        {occurrence.estimated ? ' (estime)' : ''} - {occurrence.category}
                      </p>
                    </div>
                    <p
                      className={`font-heading-lg text-heading-lg text-right ${
                        occurrence.amountCents > 0 ? 'text-success' : 'text-ink'
                      }`}
                    >
                      {formatSignedCents(occurrence.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section>
        <div className="flex justify-between items-end mb-xl">
          <h3 className="font-heading-xl text-heading-xl text-ink">Paiements recurrents</h3>
          <button
            type="button"
            className="font-label-caps text-label-caps text-mute border-b border-mute uppercase"
            onClick={() => setModal({ mode: 'create' })}
          >
            Ajouter
          </button>
        </div>
        <div className="space-y-0 border-t border-hairline">
          {recurringTransactions.length === 0 ? (
            <p className="py-xl text-center text-mute font-body-sm text-body-sm">Aucun paiement recurrent.</p>
          ) : (
            recurringTransactions.map((recurringTransaction) => (
              <RecurringTransactionRow
                key={recurringTransaction.id}
                recurringTransaction={recurringTransaction}
                accountName={accountNames.get(recurringTransaction.accountId) ?? ''}
                onEdit={(rt) => setModal({ mode: 'edit', recurringTransaction: rt })}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      </section>

      {modal && (
        <RecurringTransactionFormModal
          accounts={accounts}
          recurringTransaction={modal.mode === 'edit' ? modal.recurringTransaction : null}
          onClose={() => setModal(null)}
          onSaved={() => void refresh()}
        />
      )}
    </main>
  );
}
