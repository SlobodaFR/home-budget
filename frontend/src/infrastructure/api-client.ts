import { Account, AccountPayload } from '../domain/account';
import { AidRule, AidsSummary, CrecheEstimate, CrecheQuery, crecheQueryString, FiscalProfile } from '../domain/aids';
import { Plan, Summary, Transaction, TransactionPayload } from '../domain/budget';
import { backupFilename, csvFilename, ExportRange, filenameFromContentDisposition } from '../domain/export';
import { Forecast } from '../domain/forecast';
import { Insight, parseInsights } from '../domain/insights';
import {
  Deposit,
  DepositPayload,
  parseDeposits,
  parseProject,
  parseProjects,
  parseProjectsSummary,
  Project,
  ProjectPayload,
  ProjectsSummary,
} from '../domain/project';
import { parseProvisions, Provisions } from '../domain/provisions';
import { RecurringPayload, RecurringPayment } from '../domain/recurring';
import {
  MonthlyReview,
  parseReview,
  parseReviewHistory,
  ReviewHistoryItem,
  ReviewPayload,
} from '../domain/review';
import { parseSafetyNetState, SafetyNet, SafetyNetState } from '../domain/safety-net';
import { Contribution, ContributionMode, Household, Invitation } from '../domain/household';
import { parseYearForecast, YearForecast } from '../domain/year-forecast';
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

/** Envoie la requête et renvoie la réponse si elle est réussie ; sinon lève `NetworkError` ou `ApiError`. */
async function send(path: string, method = 'GET', body?: unknown): Promise<Response> {
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
  return response;
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await send(path, method, body);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Un fichier reçu du serveur, prêt à être enregistré par le navigateur. */
export interface DownloadedFile {
  blob: Blob;
  filename: string;
}

async function download(path: string, fallbackFilename: string): Promise<DownloadedFile> {
  const response = await send(path);
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new NetworkError();
  }
  return { blob, filename: filenameFromContentDisposition(response.headers.get('Content-Disposition'), fallbackFilename) };
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

  previewImport(spaceId: string, text: string, accountId: string | null = null): Promise<ImportPreview> {
    return request<ImportPreview>(`${spacePath(spaceId)}/imports/preview`, 'POST', accountId ? { text, accountId } : { text });
  },
  commitImport(spaceId: string, items: CommitItem[], accountId: string | null = null): Promise<{ created: number }> {
    return request<{ created: number }>(`${spacePath(spaceId)}/imports/commit`, 'POST', accountId ? { items, accountId } : { items });
  },
  fetchRules(spaceId: string): Promise<RuleSet> {
    return request<RuleSet>(`${spacePath(spaceId)}/rules`);
  },
  saveRules(spaceId: string, rules: Rule[]): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/rules`, 'PUT', { rules });
  },

  async fetchInsights(spaceId: string, month: string): Promise<Insight[]> {
    return parseInsights(await request<unknown>(`${spacePath(spaceId)}/insights?month=${month}`));
  },

  async fetchReview(spaceId: string, month: string): Promise<MonthlyReview> {
    const review = parseReview(await request<unknown>(`${spacePath(spaceId)}/reviews/${encodeURIComponent(month)}`), month);
    if (!review) {
      throw new ApiError(502, 'Réponse illisible');
    }
    return review;
  },
  saveReview(spaceId: string, month: string, payload: ReviewPayload): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/reviews/${encodeURIComponent(month)}`, 'PUT', payload);
  },
  async fetchReviews(spaceId: string, limit = 12): Promise<ReviewHistoryItem[]> {
    return parseReviewHistory(await request<unknown>(`${spacePath(spaceId)}/reviews?limit=${limit}`));
  },

  /** Sauvegarde JSON de toutes les données auxquelles l'utilisateur a accès (jamais l'espace personnel d'un autre). */
  downloadExport(now: Date = new Date()): Promise<DownloadedFile> {
    return download('/export', backupFilename(now));
  },
  downloadTransactionsCsv(spaceId: string, range: ExportRange): Promise<DownloadedFile> {
    const query = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    return download(`${spacePath(spaceId)}/transactions/export?${query}`, csvFilename(range));
  },

  fetchForecast(spaceId: string, month: string): Promise<Forecast> {
    return request<Forecast>(`${spacePath(spaceId)}/forecast?month=${month}`);
  },
  async fetchProjects(spaceId: string): Promise<Project[]> {
    return parseProjects(await request<unknown>(`${spacePath(spaceId)}/projects`));
  },
  async createProject(spaceId: string, payload: ProjectPayload): Promise<Project | null> {
    return parseProject(await request<unknown>(`${spacePath(spaceId)}/projects`, 'POST', payload));
  },
  updateProject(spaceId: string, id: string, payload: ProjectPayload): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/projects/${encodeURIComponent(id)}`, 'PUT', payload);
  },
  deleteProject(spaceId: string, id: string): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/projects/${encodeURIComponent(id)}`, 'DELETE');
  },
  async fetchProjectsSummary(spaceId: string): Promise<ProjectsSummary> {
    return parseProjectsSummary(await request<unknown>(`${spacePath(spaceId)}/projects/summary`));
  },
  async fetchDeposits(spaceId: string, projectId: string): Promise<Deposit[]> {
    return parseDeposits(await request<unknown>(`${spacePath(spaceId)}/projects/${encodeURIComponent(projectId)}/deposits`));
  },
  createDeposit(spaceId: string, projectId: string, payload: DepositPayload): Promise<unknown> {
    return request<unknown>(`${spacePath(spaceId)}/projects/${encodeURIComponent(projectId)}/deposits`, 'POST', payload);
  },
  deleteDeposit(spaceId: string, projectId: string, depositId: string): Promise<void> {
    return request<void>(
      `${spacePath(spaceId)}/projects/${encodeURIComponent(projectId)}/deposits/${encodeURIComponent(depositId)}`,
      'DELETE',
    );
  },

  async fetchProvisions(spaceId: string, asOf?: string): Promise<Provisions> {
    const query = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
    return parseProvisions(await request<unknown>(`${spacePath(spaceId)}/provisions${query}`));
  },
  async fetchYearForecast(spaceId: string, year: number): Promise<YearForecast> {
    return parseYearForecast(await request<unknown>(`${spacePath(spaceId)}/forecast/year?year=${year}`), year);
  },
  fetchRecurring(spaceId: string): Promise<RecurringPayment[]> {
    return request<RecurringPayment[]>(`${spacePath(spaceId)}/recurring`);
  },
  createRecurring(spaceId: string, payload: RecurringPayload): Promise<RecurringPayment> {
    return request<RecurringPayment>(`${spacePath(spaceId)}/recurring`, 'POST', payload);
  },
  updateRecurring(spaceId: string, id: string, payload: RecurringPayload): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/recurring/${encodeURIComponent(id)}`, 'PUT', payload);
  },
  deleteRecurring(spaceId: string, id: string): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/recurring/${encodeURIComponent(id)}`, 'DELETE');
  },

  async fetchSafetyNet(): Promise<SafetyNetState> {
    return parseSafetyNetState(await request<unknown>('/household/safety-net'));
  },
  saveSafetyNet(safetyNet: SafetyNet): Promise<void> {
    return request<void>('/household/safety-net', 'PUT', safetyNet);
  },

  fetchAidRules(): Promise<AidRule[]> {
    return request<AidRule[]>('/aid-rules');
  },
  async fetchFiscalProfile(): Promise<FiscalProfile | null> {
    return (await request<{ fiscalProfile: FiscalProfile | null }>('/household/fiscal-profile')).fiscalProfile;
  },
  saveFiscalProfile(profile: FiscalProfile): Promise<void> {
    return request<void>('/household/fiscal-profile', 'PUT', profile);
  },
  fetchAids(spaceId: string, year: number): Promise<AidsSummary> {
    return request<AidsSummary>(`${spacePath(spaceId)}/aids?year=${year}`);
  },
  fetchCrecheEstimate(query: CrecheQuery): Promise<CrecheEstimate> {
    return request<CrecheEstimate>(`/aid-rules/creche-estimate?${crecheQueryString(query)}`);
  },

  fetchAccounts(spaceId: string): Promise<Account[]> {
    return request<Account[]>(`${spacePath(spaceId)}/accounts`);
  },
  createAccount(spaceId: string, payload: AccountPayload): Promise<Account> {
    return request<Account>(`${spacePath(spaceId)}/accounts`, 'POST', payload);
  },
  updateAccount(spaceId: string, id: string, payload: AccountPayload): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/accounts/${encodeURIComponent(id)}`, 'PUT', payload);
  },
  deleteAccount(spaceId: string, id: string): Promise<void> {
    return request<void>(`${spacePath(spaceId)}/accounts/${encodeURIComponent(id)}`, 'DELETE');
  },
};
