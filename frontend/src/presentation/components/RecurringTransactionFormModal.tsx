import { FormEvent, useState } from 'react';
import { AccountSummary } from '../../domain/account';
import { RecurringTransaction } from '../../domain/recurring-transaction';
import { TRANSACTION_CATEGORIES, TransactionCategory } from '../../domain/transaction';
import { apiClient } from '../../infrastructure/api-client';

type Direction = 'expense' | 'income';

interface RecurringTransactionFormModalProps {
  accounts: AccountSummary[];
  recurringTransaction?: RecurringTransaction | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RecurringTransactionFormModal({
  accounts,
  recurringTransaction = null,
  onClose,
  onSaved,
}: RecurringTransactionFormModalProps) {
  const isEditing = recurringTransaction !== null;

  const [accountId, setAccountId] = useState(recurringTransaction?.accountId ?? accounts[0]?.id ?? '');
  const [label, setLabel] = useState(recurringTransaction?.label ?? '');
  const [category, setCategory] = useState<TransactionCategory>(recurringTransaction?.category ?? 'Autre');
  const [direction, setDirection] = useState<Direction>(
    recurringTransaction && recurringTransaction.amountCents > 0 ? 'income' : 'expense',
  );
  const [amount, setAmount] = useState(
    recurringTransaction ? String(Math.abs(recurringTransaction.amountCents) / 100) : '',
  );
  const [knownDay, setKnownDay] = useState(recurringTransaction ? recurringTransaction.dayOfMonth !== null : true);
  const [dayOfMonth, setDayOfMonth] = useState(String(recurringTransaction?.dayOfMonth ?? 1));
  const [startDate, setStartDate] = useState(() =>
    recurringTransaction ? recurringTransaction.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [hasEndDate, setHasEndDate] = useState(Boolean(recurringTransaction?.endDate));
  const [endDate, setEndDate] = useState(() => recurringTransaction?.endDate?.slice(0, 10) ?? '');
  const [active, setActive] = useState(recurringTransaction?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(amount.replace(',', '.'));
    if (!accountId || !label.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Veuillez renseigner un compte, un libelle et un montant positif.');
      return;
    }
    if (knownDay && (!Number.isInteger(Number(dayOfMonth)) || Number(dayOfMonth) < 1 || Number(dayOfMonth) > 31)) {
      setError('Le jour du mois doit etre compris entre 1 et 31.');
      return;
    }

    const amountCents = Math.round(parsedAmount * 100) * (direction === 'expense' ? -1 : 1);

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        accountId,
        label: label.trim(),
        category,
        amountCents,
        dayOfMonth: knownDay ? Number(dayOfMonth) : null,
        startDate: new Date(startDate).toISOString(),
        endDate: hasEndDate && endDate ? new Date(endDate).toISOString() : null,
        active,
      };
      if (isEditing) {
        await apiClient.updateRecurringTransaction(recurringTransaction.id, payload);
      } else {
        await apiClient.createRecurringTransaction(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-margin-mobile">
      <div className="bg-surface w-full max-w-md p-xl rounded-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-xl">
          <h3 className="font-heading-xl text-heading-xl text-ink">
            {isEditing ? 'Modifier le paiement recurrent' : 'Ajouter un paiement recurrent'}
          </h3>
          <button
            type="button"
            className="material-symbols-outlined text-mute hover:text-ink"
            onClick={onClose}
            aria-label="Fermer"
          >
            close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <div className="flex gap-sm">
            <button
              type="button"
              className={`flex-1 py-sm rounded-full font-button-md border ${
                direction === 'expense' ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
              }`}
              onClick={() => setDirection('expense')}
            >
              Depense
            </button>
            <button
              type="button"
              className={`flex-1 py-sm rounded-full font-button-md border ${
                direction === 'income' ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
              }`}
              onClick={() => setDirection('income')}
            >
              Revenu
            </button>
          </div>

          <label className="flex flex-col gap-sm">
            <span className="font-label-caps text-label-caps text-mute uppercase">Compte</span>
            <select
              className="border border-hairline rounded px-md py-sm bg-surface"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-sm">
            <span className="font-label-caps text-label-caps text-mute uppercase">Libelle</span>
            <input
              className="border border-hairline rounded px-md py-sm bg-surface"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex: Loyer"
            />
          </label>

          <div className="flex gap-md">
            <label className="flex flex-col gap-sm flex-1">
              <span className="font-label-caps text-label-caps text-mute uppercase">Montant (EUR)</span>
              <input
                className="border border-hairline rounded px-md py-sm bg-surface"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </label>

            <label className="flex flex-col gap-sm flex-1">
              <span className="font-label-caps text-label-caps text-mute uppercase">Categorie</span>
              <select
                className="border border-hairline rounded px-md py-sm bg-surface"
                value={category}
                onChange={(event) => setCategory(event.target.value as TransactionCategory)}
              >
                {TRANSACTION_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-sm">
            <span className="font-label-caps text-label-caps text-mute uppercase">Date du mois</span>
            <div className="flex gap-sm items-center">
              <button
                type="button"
                className={`flex-1 py-sm rounded-full font-button-md border ${
                  knownDay ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
                }`}
                onClick={() => setKnownDay(true)}
              >
                Jour precis
              </button>
              <button
                type="button"
                className={`flex-1 py-sm rounded-full font-button-md border ${
                  !knownDay ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
                }`}
                onClick={() => setKnownDay(false)}
              >
                Date inconnue
              </button>
            </div>
            {knownDay && (
              <input
                type="number"
                min={1}
                max={31}
                className="border border-hairline rounded px-md py-sm bg-surface"
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(event.target.value)}
              />
            )}
            {!knownDay && (
              <p className="font-body-sm text-body-sm text-mute">
                La date sera estimee en fin de mois pour le previsionnel.
              </p>
            )}
          </div>

          <div className="flex gap-md">
            <label className="flex flex-col gap-sm flex-1">
              <span className="font-label-caps text-label-caps text-mute uppercase">Debut</span>
              <input
                type="date"
                className="border border-hairline rounded px-md py-sm bg-surface"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>

            <label className="flex flex-col gap-sm flex-1">
              <span className="font-label-caps text-label-caps text-mute uppercase">Fin (optionnel)</span>
              <input
                type="date"
                disabled={!hasEndDate}
                className="border border-hairline rounded px-md py-sm bg-surface disabled:opacity-50"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <label className="flex items-center gap-sm">
            <input type="checkbox" checked={hasEndDate} onChange={(event) => setHasEndDate(event.target.checked)} />
            <span className="font-body-sm text-body-sm text-ink">Definir une date de fin</span>
          </label>

          <label className="flex items-center gap-sm">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            <span className="font-body-sm text-body-sm text-ink">Actif</span>
          </label>

          {error && <p className="text-error font-body-sm text-body-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-ink text-surface px-xl py-md rounded-full font-button-md mt-sm disabled:opacity-50"
          >
            {submitting ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </form>
      </div>
    </div>
  );
}
