import { useState } from 'react';
import { useDashboard } from '../../application/use-dashboard';
import { AccountSummary } from '../../domain/account';
import { TransactionItem } from '../../domain/transaction';
import { apiClient } from '../../infrastructure/api-client';
import { AccountCard } from '../components/AccountCard';
import { AccountFormModal } from '../components/AccountFormModal';
import { AddTransactionModal } from '../components/AddTransactionModal';
import { HeroEquity } from '../components/HeroEquity';
import { TransactionRow } from '../components/TransactionRow';

type AccountModalState = { mode: 'create' } | { mode: 'edit'; account: AccountSummary } | null;
type TransactionModalState = { mode: 'create' } | { mode: 'edit'; transaction: TransactionItem } | null;

export function DashboardPage() {
  const { loading, error, totalBalanceCents, accounts, transactions, refresh } = useDashboard();
  const [transactionModal, setTransactionModal] = useState<TransactionModalState>(null);
  const [accountModal, setAccountModal] = useState<AccountModalState>(null);

  if (loading && accounts.length === 0) {
    return <div className="px-margin-mobile py-section text-center text-mute">Chargement...</div>;
  }

  if (error) {
    return <div className="px-margin-mobile py-section text-center text-error">Erreur : {error}</div>;
  }

  async function handleDelete(account: AccountSummary) {
    if (!window.confirm(`Supprimer "${account.name}" et toutes ses transactions ?`)) {
      return;
    }
    await apiClient.deleteAccount(account.id);
    void refresh();
  }

  async function handleDeleteTransaction(transaction: TransactionItem) {
    if (!window.confirm(`Supprimer la transaction "${transaction.label}" ?`)) {
      return;
    }
    await apiClient.deleteTransaction(transaction.id);
    void refresh();
  }

  return (
    <main className="pb-32">
      <HeroEquity totalBalanceCents={totalBalanceCents} onAddTransaction={() => setTransactionModal({ mode: 'create' })} />

      <section className="px-margin-mobile md:px-margin-desktop py-section">
        <div className="flex justify-between items-end mb-xl">
          <h3 className="font-heading-xl text-heading-xl text-ink">Mes Comptes</h3>
          <button
            type="button"
            className="font-label-caps text-label-caps text-mute border-b border-mute uppercase"
            onClick={() => setAccountModal({ mode: 'create' })}
          >
            Ajouter un compte
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={(acc) => setAccountModal({ mode: 'edit', account: acc })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </section>

      <section className="px-margin-mobile md:px-margin-desktop py-section max-w-4xl mx-auto">
        <h3 className="font-heading-xl text-heading-xl text-ink mb-xl">Transactions Recentes</h3>
        <div className="space-y-0 border-t border-hairline">
          {transactions.length === 0 ? (
            <p className="py-xl text-center text-mute font-body-sm text-body-sm">Aucune transaction.</p>
          ) : (
            transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                onEdit={(tx) => setTransactionModal({ mode: 'edit', transaction: tx })}
                onDelete={handleDeleteTransaction}
              />
            ))
          )}
        </div>
      </section>

      {transactionModal && (
        <AddTransactionModal
          accounts={accounts}
          transaction={transactionModal.mode === 'edit' ? transactionModal.transaction : null}
          onClose={() => setTransactionModal(null)}
          onCreated={() => void refresh()}
        />
      )}

      {accountModal && (
        <AccountFormModal
          account={accountModal.mode === 'edit' ? accountModal.account : null}
          onClose={() => setAccountModal(null)}
          onSaved={() => void refresh()}
        />
      )}
    </main>
  );
}
