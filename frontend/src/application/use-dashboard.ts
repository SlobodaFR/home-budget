import { useCallback, useEffect, useState } from 'react';
import { AccountSummary } from '../domain/account';
import { TransactionItem } from '../domain/transaction';
import { apiClient } from '../infrastructure/api-client';

export interface DashboardState {
  loading: boolean;
  error: string | null;
  totalBalanceCents: number;
  accounts: AccountSummary[];
  transactions: TransactionItem[];
  refresh: () => Promise<void>;
}

const INITIAL_DATA = {
  totalBalanceCents: 0,
  accounts: [] as AccountSummary[],
  transactions: [] as TransactionItem[],
};

/**
 * Loads the data needed by the dashboard: total household equity, every
 * account with its current balance, and the most recent transactions.
 * Exposes `refresh` so the UI can reload after a mutation (e.g. a new
 * transaction).
 */
export function useDashboard(): DashboardState {
  const [data, setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [equity, accounts, transactions] = await Promise.all([
        apiClient.fetchEquity(),
        apiClient.fetchAccounts(),
        apiClient.fetchRecentTransactions(),
      ]);

      setData({ totalBalanceCents: equity.totalBalanceCents, accounts, transactions });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, ...data, refresh };
}
