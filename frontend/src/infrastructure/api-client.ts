import { AccountSummary, AccountType } from '../domain/account';
import { TransactionCategory, TransactionItem } from '../domain/transaction';
import { BalanceForecast, RecurringTransaction } from '../domain/recurring-transaction';

const BASE_URL = '/api';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function sendJson(path: string, method: string, body: unknown): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.message ? String(errorBody.message) : `La requete a echoue (${response.status})`);
  }
  return response;
}

export interface EquitySummary {
  totalBalanceCents: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

export interface SaveTransactionPayload {
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  date?: string;
}

export interface SaveAccountPayload {
  name: string;
  type: AccountType;
  icon: string;
  monthlyBudgetCents: number | null;
}

export interface SaveRecurringTransactionPayload {
  accountId: string;
  label: string;
  category: TransactionCategory;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
}

export const apiClient = {
  fetchAccounts(): Promise<AccountSummary[]> {
    return getJson<AccountSummary[]>('/accounts');
  },
  fetchEquity(): Promise<EquitySummary> {
    return getJson<EquitySummary>('/accounts/equity');
  },
  fetchRecentTransactions(limit = 10): Promise<TransactionItem[]> {
    return getJson<TransactionItem[]>(`/transactions?limit=${limit}`);
  },
  async createTransaction(payload: SaveTransactionPayload): Promise<TransactionItem> {
    const response = await sendJson('/transactions', 'POST', payload);
    return response.json() as Promise<TransactionItem>;
  },
  async updateTransaction(id: string, payload: SaveTransactionPayload): Promise<void> {
    await sendJson(`/transactions/${id}`, 'PUT', payload);
  },
  async deleteTransaction(id: string): Promise<void> {
    await sendJson(`/transactions/${id}`, 'DELETE', undefined);
  },
  async createAccount(payload: SaveAccountPayload): Promise<AccountSummary> {
    const response = await sendJson('/accounts', 'POST', payload);
    return response.json() as Promise<AccountSummary>;
  },
  async updateAccount(id: string, payload: SaveAccountPayload): Promise<void> {
    await sendJson(`/accounts/${id}`, 'PUT', payload);
  },
  async deleteAccount(id: string): Promise<void> {
    await sendJson(`/accounts/${id}`, 'DELETE', undefined);
  },
  async fetchCurrentUser(): Promise<CurrentUser | null> {
    const response = await fetch(`${BASE_URL}/auth/me`, { credentials: 'include' });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { user: CurrentUser };
    return body.user;
  },
  async logout(): Promise<void> {
    await sendJson('/auth/logout', 'POST', undefined);
  },
  fetchRecurringTransactions(): Promise<RecurringTransaction[]> {
    return getJson<RecurringTransaction[]>('/recurring-transactions');
  },
  fetchBalanceForecast(date: string): Promise<BalanceForecast> {
    return getJson<BalanceForecast>(`/recurring-transactions/forecast?date=${date}`);
  },
  async createRecurringTransaction(payload: SaveRecurringTransactionPayload): Promise<RecurringTransaction> {
    const response = await sendJson('/recurring-transactions', 'POST', payload);
    return response.json() as Promise<RecurringTransaction>;
  },
  async updateRecurringTransaction(id: string, payload: SaveRecurringTransactionPayload): Promise<void> {
    await sendJson(`/recurring-transactions/${id}`, 'PUT', payload);
  },
  async deleteRecurringTransaction(id: string): Promise<void> {
    await sendJson(`/recurring-transactions/${id}`, 'DELETE', undefined);
  },
};
