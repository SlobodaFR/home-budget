import { Bloc, isBloc } from '../domain/bloc';
import { Household, SpaceKind } from '../domain/household';
import { enqueue, parseQueue, PendingTransaction, removeFromQueue, serializeQueue } from '../domain/offline-queue';
import { CurrentUser } from './api-client';

const PREFIX = 'foyer-budget:';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(PREFIX + key);
    } else {
      window.localStorage.setItem(PREFIX + key, value);
    }
  } catch {
    // storage full or unavailable: preferences are best-effort
  }
}

export const preferences = {
  getSpaceKind(): SpaceKind {
    return read('space-kind') === 'PERSONAL' ? 'PERSONAL' : 'COMMON';
  },
  setSpaceKind(kind: SpaceKind): void {
    write('space-kind', kind);
  },
  getLastBloc(): Bloc {
    const value = read('last-bloc');
    return isBloc(value) ? value : 'COURANT';
  },
  setLastBloc(bloc: Bloc): void {
    write('last-bloc', bloc);
  },
};

export const pendingStore = {
  load(userId: string): PendingTransaction[] {
    return parseQueue(read(`pending:${userId}`));
  },
  add(userId: string, item: PendingTransaction): PendingTransaction[] {
    const next = enqueue(this.load(userId), item);
    write(`pending:${userId}`, serializeQueue(next));
    return next;
  },
  remove(userId: string, clientId: string): PendingTransaction[] {
    const next = removeFromQueue(this.load(userId), clientId);
    write(`pending:${userId}`, next.length === 0 ? null : serializeQueue(next));
    return next;
  },
  storageKey(userId: string): string {
    return `${PREFIX}pending:${userId}`;
  },
};

interface CachedSession {
  user: CurrentUser;
  household: Household | null;
}

export const sessionCache = {
  load(): CachedSession | null {
    try {
      const parsed = JSON.parse(read('session') ?? 'null') as CachedSession | null;
      return parsed?.user?.id ? parsed : null;
    } catch {
      return null;
    }
  },
  saveUser(user: CurrentUser): void {
    write('session', JSON.stringify({ user, household: this.load()?.household ?? null }));
  },
  saveHousehold(user: CurrentUser, household: Household | null): void {
    const sanitized = household
      ? { ...household, members: household.members.map((member) => ({ ...member, netMonthlyIncomeCents: null })) }
      : null;
    write('session', JSON.stringify({ user, household: sanitized }));
  },
  clear(): void {
    write('session', null);
  },
};
