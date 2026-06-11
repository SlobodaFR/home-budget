import { useCallback, useEffect, useState } from 'react';
import { BalanceForecast, RecurringTransaction } from '../domain/recurring-transaction';
import { apiClient } from '../infrastructure/api-client';

export interface ForecastState {
  loading: boolean;
  error: string | null;
  forecast: BalanceForecast | null;
  recurringTransactions: RecurringTransaction[];
  refresh: () => Promise<void>;
}

/**
 * Loads the recurring transaction templates and the projected balance up to
 * `targetDate` (an ISO date string, e.g. "2026-06-30").
 */
export function useForecast(targetDate: string): ForecastState {
  const [forecast, setForecast] = useState<BalanceForecast | null>(null);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [forecastResult, recurring] = await Promise.all([
        apiClient.fetchBalanceForecast(targetDate),
        apiClient.fetchRecurringTransactions(),
      ]);
      setForecast(forecastResult);
      setRecurringTransactions(recurring);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { loading, error, forecast, recurringTransactions, refresh };
}
