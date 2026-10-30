import { describe, expect, it, vi } from 'vitest';
import { TransactionPayload } from './budget';
import {
  classifyFailure,
  createPendingTransaction,
  enqueue,
  flushQueue,
  parseQueue,
  pendingForMonth,
  PendingTransaction,
  removeFromQueue,
  SendOutcome,
  serializeQueue,
} from './offline-queue';

const payload: TransactionPayload = {
  kind: 'EXPENSE',
  bloc: 'COURANT',
  label: 'Courses',
  amountCents: 1250,
  date: '2026-10-03T00:00:00.000Z',
};

const item = (id: string, spaceId = 'space-1'): PendingTransaction => createPendingTransaction(spaceId, payload, id, new Date('2026-10-03T10:00:00Z'));

describe('queue basics', () => {
  it('appends items in order', () => {
    expect(enqueue(enqueue([], item('a')), item('b')).map((entry) => entry.clientId)).toEqual(['a', 'b']);
  });

  it('never enqueues the same client id twice', () => {
    const queue = enqueue([], item('a'));
    expect(enqueue(queue, item('a'))).toHaveLength(1);
  });

  it('removes an item by client id', () => {
    expect(removeFromQueue([item('a'), item('b')], 'a').map((entry) => entry.clientId)).toEqual(['b']);
  });

  it('keeps only the items of a space and month', () => {
    const other = { ...item('c', 'space-2') };
    const november = { ...item('d'), payload: { ...payload, date: '2026-11-01T00:00:00.000Z' } };
    expect(pendingForMonth([item('a'), other, november], 'space-1', '2026-10').map((entry) => entry.clientId)).toEqual(['a']);
  });
});

describe('persistence', () => {
  it('round-trips through JSON', () => {
    const queue = [item('a'), item('b')];
    expect(parseQueue(serializeQueue(queue))).toEqual(queue);
  });

  it('tolerates missing, corrupted or malformed storage', () => {
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue('{not json')).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue(JSON.stringify([item('a'), { clientId: 'x' }, null, 3]))).toEqual([item('a')]);
  });

  it('drops duplicated client ids found in storage', () => {
    expect(parseQueue(JSON.stringify([item('a'), item('a')]))).toHaveLength(1);
  });
});

describe('classifyFailure', () => {
  it('retries on network errors, expired sessions and gateway errors', () => {
    expect(classifyFailure('network')).toBe('retry');
    expect(classifyFailure(401)).toBe('retry');
    expect(classifyFailure(503)).toBe('retry');
  });

  it('rejects definitive errors', () => {
    expect(classifyFailure(400)).toBe('rejected');
    expect(classifyFailure(404)).toBe('rejected');
  });
});

describe('flushQueue', () => {
  it('sends every item once, in order, and empties the queue', async () => {
    const send = vi.fn<(entry: PendingTransaction) => Promise<SendOutcome>>().mockResolvedValue('sent');
    const result = await flushQueue([item('a'), item('b')], { send });
    expect(send.mock.calls.map(([entry]) => entry.clientId)).toEqual(['a', 'b']);
    expect(result.sent).toHaveLength(2);
    expect(result.remaining).toEqual([]);
  });

  it('stops at the first retry and keeps the rest in order', async () => {
    const send = vi
      .fn<(entry: PendingTransaction) => Promise<SendOutcome>>()
      .mockResolvedValueOnce('sent')
      .mockResolvedValueOnce('retry');
    const result = await flushQueue([item('a'), item('b'), item('c')], { send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent.map((entry) => entry.clientId)).toEqual(['a']);
    expect(result.remaining.map((entry) => entry.clientId)).toEqual(['b', 'c']);
  });

  it('drops rejected items without blocking the following ones', async () => {
    const send = vi
      .fn<(entry: PendingTransaction) => Promise<SendOutcome>>()
      .mockResolvedValueOnce('rejected')
      .mockResolvedValueOnce('sent');
    const result = await flushQueue([item('a'), item('b')], { send });
    expect(result.rejected.map((entry) => entry.clientId)).toEqual(['a']);
    expect(result.sent.map((entry) => entry.clientId)).toEqual(['b']);
    expect(result.remaining).toEqual([]);
  });

  it('reports each settled item as soon as it is done, so it can be persisted', async () => {
    const settled: string[] = [];
    const send = vi
      .fn<(entry: PendingTransaction) => Promise<SendOutcome>>()
      .mockResolvedValueOnce('sent')
      .mockResolvedValueOnce('retry');
    await flushQueue([item('a'), item('b')], { send, onSettled: (entry) => settled.push(entry.clientId) });
    expect(settled).toEqual(['a']);
  });

  it('does nothing on an empty queue', async () => {
    const send = vi.fn();
    expect(await flushQueue([], { send })).toEqual({ sent: [], rejected: [], remaining: [] });
    expect(send).not.toHaveBeenCalled();
  });
});
