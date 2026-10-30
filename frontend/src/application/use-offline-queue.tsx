import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { TransactionPayload } from '../domain/budget';
import {
  classifyFailure,
  createPendingTransaction,
  flushQueue,
  PendingTransaction,
  SendOutcome,
} from '../domain/offline-queue';
import { ApiError, apiClient } from '../infrastructure/api-client';
import { pendingStore } from '../infrastructure/local-store';
import { useAuth } from '../presentation/auth/AuthProvider';

export type SubmitResult = 'saved' | 'queued';

interface OfflineQueueValue {
  pending: PendingTransaction[];
  rejected: PendingTransaction[];
  dataVersion: number;
  submit: (spaceId: string, payload: TransactionPayload) => Promise<SubmitResult>;
  notifyChanged: () => void;
  dismissRejected: () => void;
}

const OfflineQueueContext = createContext<OfflineQueueValue | null>(null);

function newClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function classifyError(error: unknown): SendOutcome {
  return error instanceof ApiError ? classifyFailure(error.status) : 'retry';
}

async function sendPending(item: PendingTransaction): Promise<SendOutcome> {
  try {
    await apiClient.createTransaction(item.spaceId, item.payload);
    return 'sent';
  } catch (error) {
    return classifyError(error);
  }
}

async function withFlushLock(task: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('foyer-budget-flush', task);
  } else {
    await task();
  }
}

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [pending, setPending] = useState<PendingTransaction[]>(() => pendingStore.load(userId));
  const [rejected, setRejected] = useState<PendingTransaction[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const flushing = useRef(false);

  const notifyChanged = useCallback(() => setDataVersion((value) => value + 1), []);

  const flush = useCallback(async () => {
    if (flushing.current || pendingStore.load(userId).length === 0) {
      return;
    }
    flushing.current = true;
    try {
      await withFlushLock(async () => {
        const result = await flushQueue(pendingStore.load(userId), {
          send: sendPending,
          onSettled: (item) => setPending(pendingStore.remove(userId, item.clientId)),
        });
        if (result.rejected.length > 0) {
          setRejected((previous) => [...previous, ...result.rejected]);
        }
        if (result.sent.length > 0) {
          notifyChanged();
        }
      });
    } finally {
      flushing.current = false;
    }
  }, [userId, notifyChanged]);

  useEffect(() => {
    void flush();
    const handleOnline = () => void flush();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void flush();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === pendingStore.storageKey(userId)) {
        setPending(pendingStore.load(userId));
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flush, userId]);

  const submit = useCallback(
    async (spaceId: string, payload: TransactionPayload): Promise<SubmitResult> => {
      const item = createPendingTransaction(spaceId, payload, newClientId());
      try {
        await apiClient.createTransaction(spaceId, payload);
      } catch (error) {
        if (classifyError(error) === 'retry') {
          setPending(pendingStore.add(userId, item));
          return 'queued';
        }
        throw error;
      }
      notifyChanged();
      void flush();
      return 'saved';
    },
    [userId, notifyChanged, flush],
  );

  const dismissRejected = useCallback(() => setRejected([]), []);

  const value = useMemo(
    () => ({ pending, rejected, dataVersion, submit, notifyChanged, dismissRejected }),
    [pending, rejected, dataVersion, submit, notifyChanged, dismissRejected],
  );
  return <OfflineQueueContext.Provider value={value}>{children}</OfflineQueueContext.Provider>;
}

export function useOfflineQueue(): OfflineQueueValue {
  const context = useContext(OfflineQueueContext);
  if (!context) {
    throw new Error('useOfflineQueue must be used within an OfflineQueueProvider');
  }
  return context;
}
