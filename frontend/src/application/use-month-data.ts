import { useCallback } from 'react';
import { Summary, Transaction } from '../domain/budget';
import { apiClient } from '../infrastructure/api-client';
import { Resource, useResource } from './use-resource';
import { useOfflineQueue } from './use-offline-queue';

export interface MonthData {
  summary: Resource<Summary>;
  transactions: Resource<Transaction[]>;
  removeTransaction: (id: string) => Promise<void>;
}

export function useMonthData(spaceId: string, month: string): MonthData {
  const { dataVersion, notifyChanged } = useOfflineQueue();
  const summary = useResource(() => apiClient.fetchSummary(spaceId, month), [spaceId, month], dataVersion);
  const transactions = useResource(() => apiClient.fetchTransactions(spaceId, month), [spaceId, month], dataVersion);

  const removeTransaction = useCallback(
    async (id: string) => {
      await apiClient.deleteTransaction(spaceId, id);
      notifyChanged();
    },
    [spaceId, notifyChanged],
  );

  return { summary, transactions, removeTransaction };
}
