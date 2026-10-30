import { Plan, Summary, Transaction, TransactionPayload } from '../domain/budget';
import { Contribution, ContributionMode, Household, Invitation } from '../domain/household';
import { CommitItem, ImportPreview, Rule, RuleSet } from '../domain/statement-import';

const BASE_URL = '/api';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export type AuthConfig = { mode: 'oauth' } | { mode: 'dev'; devUsers: string[] };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Réseau indisponible');
    this.name = 'NetworkError';
  }
}

type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export function onUnauthorized(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      unauthorizedListener?.();
    }
    const errorBody = (await response.json().catch(() => null)) as { message?: unknown } | null;
    const message = Array.isArray(errorBody?.message) ? errorBody.message.join(', ') : errorBody?.message;
    throw new ApiError(response.status, typeof message === 'string' ? message : `Erreur ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

const spacePath = (spaceId: string) => `/spaces/${encodeURIComponent(spaceId)}`;

export const apiClient = {
  fetchAuthConfig(): Promise<AuthConfig> {
    return request<AuthConfig>('/auth/config');
  },
  async fetchCurrentUser(): Promise<CurrentUser | null> {
    try {
      return (await request<{ user: CurrentUser }>('/auth/me')).user;
    } catch (error) {
      if (error instanceof ApiError) {
        return null;
      }
      throw error;
    }
  },
  logout(): Promise<void> {
    return request<void>('/auth/logout', 'POST');
  },

  async fetchHousehold(): Promise<Household | null> {
    return (await request<{ household: Household | null }>('/household')).household;
  },
  createHousehold(payload: { name: string; netMonthlyIncomeCents?: number }): Promise<Household> {
    return request<Household>('/household', 'POST', payload);
  },
  createInvitation(): Promise<Invitation> {
    return request<Invitation>('/household/invitations', 'POST');
  },
  joinHousehold(code: string): Promise<Household> {
    return request<Household>('/household/join', 'POST', { code });
  },
  updateMyIncome(netMonthlyIncomeCents: number | null): Promise<void> {
    return request<void>('/household/me/income', 'PUT', { netMonthlyIncomeCents });
  },
  updateContributionMode(mode: ContributionMode): Promise<void> {
    return request<void>('/household/contribution-mode', 'PUT', { mode });
  },
  fetchContribution(): Promise<Contribution> {
    return request<Contribution>('/household/contribution');
  },

  fetchPlan(spaceId: string): Promise<Plan> {
    return request<Plan>(`${spacePath(spaceId)}/plan`);
  },
  updatePlan(spaceId: string, plan: Plan): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/plan`, 'PUT', plan);
  },
  fetchTransactions(spaceId: string, month: string): Promise<Transaction[]> {
    return request<Transaction[]>(`${spacePath(spaceId)}/transactions?month=${month}`);
  },
  createTransaction(spaceId: string, payload: TransactionPayload): Promise<Transaction> {
    return request<Transaction>(`${spacePath(spaceId)}/transactions`, 'POST', payload);
  },
  updateTransaction(spaceId: string, id: string, payload: TransactionPayload): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/transactions/${encodeURIComponent(id)}`, 'PUT', payload);
  },
  deleteTransaction(spaceId: string, id: string): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/transactions/${encodeURIComponent(id)}`, 'DELETE');
  },
  fetchSummary(spaceId: string, month: string): Promise<Summary> {
    return request<Summary>(`${spacePath(spaceId)}/summary?month=${month}`);
  },

  previewImport(spaceId: string, text: string): Promise<ImportPreview> {
    return request<ImportPreview>(`${spacePath(spaceId)}/imports/preview`, 'POST', { text });
  },
  commitImport(spaceId: string, items: CommitItem[]): Promise<{ created: number }> {
    return request<{ created: number }>(`${spacePath(spaceId)}/imports/commit`, 'POST', { items });
  },
  fetchRules(spaceId: string): Promise<RuleSet> {
    return request<RuleSet>(`${spacePath(spaceId)}/rules`);
  },
  saveRules(spaceId: string, rules: Rule[]): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/rules`, 'PUT', { rules });
  },
};
