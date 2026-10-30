import { isBloc } from './bloc';
import { TransactionPayload } from './budget';

export interface PendingTransaction {
  clientId: string;
  spaceId: string;
  payload: TransactionPayload;
  queuedAt: string;
}

export type SendOutcome = 'sent' | 'retry' | 'rejected';

export interface FlushResult {
  sent: PendingTransaction[];
  rejected: PendingTransaction[];
  remaining: PendingTransaction[];
}

export interface FlushHandlers {
  send: (item: PendingTransaction) => Promise<SendOutcome>;
  onSettled?: (item: PendingTransaction, outcome: 'sent' | 'rejected') => void;
}

const RETRYABLE_STATUSES = new Set([401, 408, 429, 502, 503, 504]);

export function classifyFailure(status: number | 'network'): SendOutcome {
  return status === 'network' || RETRYABLE_STATUSES.has(status) ? 'retry' : 'rejected';
}

export function createPendingTransaction(
  spaceId: string,
  payload: TransactionPayload,
  clientId: string,
  now: Date = new Date(),
): PendingTransaction {
  return { clientId, spaceId, payload, queuedAt: now.toISOString() };
}

export function enqueue(queue: PendingTransaction[], item: PendingTransaction): PendingTransaction[] {
  return queue.some((existing) => existing.clientId === item.clientId) ? queue : [...queue, item];
}

export function removeFromQueue(queue: PendingTransaction[], clientId: string): PendingTransaction[] {
  return queue.filter((item) => item.clientId !== clientId);
}

export function pendingForMonth(queue: PendingTransaction[], spaceId: string, month: string): PendingTransaction[] {
  return queue.filter((item) => item.spaceId === spaceId && item.payload.date.startsWith(month));
}

function isPendingTransaction(value: unknown): value is PendingTransaction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  const payload = item.payload as Record<string, unknown> | undefined;
  return (
    typeof item.clientId === 'string' &&
    typeof item.spaceId === 'string' &&
    typeof item.queuedAt === 'string' &&
    typeof payload === 'object' &&
    payload !== null &&
    (payload.kind === 'INCOME' || payload.kind === 'EXPENSE') &&
    (payload.bloc === undefined || isBloc(payload.bloc)) &&
    (payload.accountId === undefined || payload.accountId === null || typeof payload.accountId === 'string') &&
    typeof payload.label === 'string' &&
    Number.isInteger(payload.amountCents) &&
    typeof payload.date === 'string'
  );
}

export function parseQueue(raw: string | null): PendingTransaction[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isPendingTransaction).reduce<PendingTransaction[]>(enqueue, []);
  } catch {
    return [];
  }
}

export function serializeQueue(queue: PendingTransaction[]): string {
  return JSON.stringify(queue);
}

export async function flushQueue(queue: PendingTransaction[], handlers: FlushHandlers): Promise<FlushResult> {
  const result: FlushResult = { sent: [], rejected: [], remaining: [] };
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    const outcome = await handlers.send(item);
    if (outcome === 'retry') {
      result.remaining = queue.slice(index);
      return result;
    }
    (outcome === 'sent' ? result.sent : result.rejected).push(item);
    handlers.onSettled?.(item, outcome);
  }
  return result;
}
