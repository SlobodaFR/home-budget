import { FormEvent, useState } from 'react';
import { AccountSummary } from '../../domain/account';
import { TRANSACTION_CATEGORIES, TransactionCategory, TransactionItem } from '../../domain/transaction';
import { apiClient } from '../../infrastructure/api-client';

type TransactionDirection = 'expense' | 'income';

interface AddTransactionModalProps {
  accounts: AccountSummary[];
  transaction?: TransactionItem | null;
  onClose: () => void;
  onCreated: () => void;
}

export function AddTransactionModal({ accounts, transaction = null, onClose, onCreated }: AddTransactionModalProps) {
  const isEditing = transaction !== null;

  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts[0]?.id ?? '');
  const [label, setLabel] = useState(transaction?.label ?? '');
  const [category, setCategory] = useState<TransactionCategory>(transaction?.category ?? 'Autre');
  const [direction, setDirection] = useState<TransactionDirection>(
    transaction && transaction.amountCents > 0 ? 'income' : 'expense',
  );
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amountCents) / 100) : '');
  const [date, setDate] = useState(() =>
    transaction ? transaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(amount.replace(',', '.'));
    if (!accountId || !label.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Veuillez renseigner un compte, un libelle et un montant positif.');
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
        date: new Date(date).toISOString(),
      };
      if (isEditing) {
        await apiClient.updateTransaction(transaction.id, payload);
      } else {
        await apiClient.createTransaction(payload);
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-margin-mobile">
      <div className="bg-surface w-full max-w-md p-xl rounded-lg">
        <div className="flex justify-between items-center mb-xl">
          <h3 className="font-heading-xl text-heading-xl text-ink">
            {isEditing ? 'Modifier la transaction' : 'Ajouter une transaction'}
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
              placeholder="Ex: Courses Monoprix"
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
              <span className="font-label-caps text-label-caps text-mute uppercase">Date</span>
              <input
                type="date"
                className="border border-hairline rounded px-md py-sm bg-surface"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>

          <label className="flex flex-col gap-sm">
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
