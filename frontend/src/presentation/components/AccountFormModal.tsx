import { FormEvent, useState } from 'react';
import { AccountSummary, AccountType } from '../../domain/account';
import { apiClient } from '../../infrastructure/api-client';

const ICON_OPTIONS = [
  'account_balance_wallet',
  'shopping_bag',
  'home',
  'bolt',
  'savings',
  'credit_card',
  'directions_car',
  'restaurant',
  'local_hospital',
  'school',
  'flight',
  'redeem',
];

interface AccountFormModalProps {
  account: AccountSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AccountFormModal({ account, onClose, onSaved }: AccountFormModalProps) {
  const isEditing = account !== null;

  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? AccountType.EXPENSE);
  const [icon, setIcon] = useState(account?.icon ?? ICON_OPTIONS[0]);
  const [monthlyBudget, setMonthlyBudget] = useState(
    account?.monthlyBudgetCents !== null && account?.monthlyBudgetCents !== undefined
      ? String(account.monthlyBudgetCents / 100)
      : '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setError('Le nom du compte est requis.');
      return;
    }

    let monthlyBudgetCents: number | null = null;
    if (type === AccountType.EXPENSE) {
      const parsed = Number(monthlyBudget.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Le budget mensuel doit etre un montant positif.');
        return;
      }
      monthlyBudgetCents = Math.round(parsed * 100);
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = { name: name.trim(), type, icon, monthlyBudgetCents };
      if (isEditing) {
        await apiClient.updateAccount(account.id, payload);
      } else {
        await apiClient.createAccount(payload);
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
      <div className="bg-surface w-full max-w-md p-xl rounded-lg">
        <div className="flex justify-between items-center mb-xl">
          <h3 className="font-heading-xl text-heading-xl text-ink">
            {isEditing ? 'Modifier le compte' : 'Ajouter un compte'}
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
                type === AccountType.EXPENSE ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
              }`}
              onClick={() => setType(AccountType.EXPENSE)}
            >
              Prelevement
            </button>
            <button
              type="button"
              className={`flex-1 py-sm rounded-full font-button-md border ${
                type === AccountType.SOURCE ? 'bg-ink text-surface border-ink' : 'border-hairline text-ink'
              }`}
              onClick={() => setType(AccountType.SOURCE)}
            >
              Entrees
            </button>
          </div>

          <label className="flex flex-col gap-sm">
            <span className="font-label-caps text-label-caps text-mute uppercase">Nom</span>
            <input
              className="border border-hairline rounded px-md py-sm bg-surface"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Compte Prelevements 4"
            />
          </label>

          <label className="flex flex-col gap-sm">
            <span className="font-label-caps text-label-caps text-mute uppercase">Icone</span>
            <select
              className="border border-hairline rounded px-md py-sm bg-surface"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              {ICON_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          {type === AccountType.EXPENSE && (
            <label className="flex flex-col gap-sm">
              <span className="font-label-caps text-label-caps text-mute uppercase">Budget mensuel (EUR)</span>
              <input
                className="border border-hairline rounded px-md py-sm bg-surface"
                inputMode="decimal"
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                placeholder="0,00"
              />
            </label>
          )}

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
