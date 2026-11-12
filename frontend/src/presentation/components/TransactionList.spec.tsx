import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Transaction } from '../../domain/budget';
import { account } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchAccounts: vi.fn<ApiMock<'fetchAccounts'>>() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn<() => Promise<void>>() }),
}));

import { TransactionList } from './TransactionList';
import type { ApiMock } from '../../test/api-mock';

const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  spaceId: 's-common',
  kind: 'EXPENSE',
  bloc: 'COURANT',
  label: 'Courses',
  amountCents: 4200,
  date: '2026-11-03T00:00:00.000Z',
  accountId: null,
  ...overrides,
});

function renderList(props: Partial<Parameters<typeof TransactionList>[0]> = {}) {
  return renderInApp(<TransactionList transactions={[transaction()]} pending={[]} onEdit={vi.fn<() => void>()} onDelete={vi.fn<(transaction: Transaction) => Promise<void>>()} {...props} />);
}

describe('TransactionList (tableau sur ordinateur)', () => {
  beforeEach(() => {
    api.fetchAccounts.mockReset();
    api.fetchAccounts.mockResolvedValue([account({ id: 'a1', name: 'Compte commun' })]);
  });

  it('has column headings for the desktop table, hidden from screen readers (the rows stay a plain list)', () => {
    renderList();
    const heading = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(heading.className).toContain('hidden');
    expect(heading.className).toContain('lg:grid');
    expect(heading.textContent).toBe('DateLibelléBlocCompteMontant');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('puts the date, the label, the bloc, the account and the amount of a row in separate cells', async () => {
    renderList({ transactions: [transaction({ accountId: 'a1' })] });
    await waitFor(() => expect(screen.getByText('Compte commun')).toBeInTheDocument());
    const row = screen.getByRole('listitem');
    const edit = within(row).getByRole('button', { name: 'Modifier Courses' });
    expect(edit.className).toContain('lg:grid');
    expect(edit.className).toContain('cursor-pointer');
    expect(within(edit).getByText('3 nov.')).toBeInTheDocument();
    expect(within(edit).getByText('Courses')).toBeInTheDocument();
    expect(within(edit).getByText('Courant')).toBeInTheDocument();
    expect(within(edit).getByText('Compte commun')).toBeInTheDocument();
    expect(edit).toHaveTextContent('− 42,00 €');
    expect(row.className).toContain('lg:hover:bg-soft-cloud');
  });

  it('keeps the compact « date · bloc » line on mobile', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'Modifier Courses' })).toHaveTextContent('3 nov. · Courant');
  });

  it('shows pending operations in the same columns', () => {
    renderList({
      transactions: [],
      pending: [{ clientId: 'c1', spaceId: 's-common', payload: { kind: 'EXPENSE', bloc: 'COURANT', label: 'Pain', amountCents: 150, date: '2026-11-04' } } as never],
    });
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Pain')).toBeInTheDocument();
    expect(within(row).getByText('En attente d’envoi')).toBeInTheDocument();
  });

  it('keeps the empty message without a table', () => {
    renderList({ transactions: [] });
    expect(screen.getByText(/Aucune opération ce mois-ci/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
