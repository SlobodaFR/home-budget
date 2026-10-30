import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  fetchTransactions: vi.fn(),
  fetchInsights: vi.fn(),
  deleteTransaction: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { HomePage } from './HomePage';

const summary = {
  month: '2026-11',
  income: { plannedCents: 380000, actualCents: 380000, gapCents: 0 },
  blocs: ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'].map((bloc) => ({ bloc, plannedCents: 1000, actualCents: 500, gapCents: -500 })),
  plannedBalanceCents: 40000,
  actualBalanceCents: 190431,
  savingsRate: 0.0789,
};

describe('HomePage insights card', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchTransactions.mockResolvedValue([]);
  });

  it('shows the next actions above the month summary and asks for the selected month', async () => {
    api.fetchInsights.mockResolvedValue([
      { id: 'plan-missing', severity: 'WARNING', title: 'Aucun plan défini', detail: 'Fixez un budget.', lesson: 1, link: '/plan' },
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Prochaines actions' });
    expect(card).toHaveTextContent('Aucun plan défini');
    expect(screen.getByRole('link', { name: 'Ouvrir le plan' })).toHaveAttribute('href', '/plan');
    expect(api.fetchInsights).toHaveBeenCalledWith('s-common', '2026-11');
    expect(await screen.findByRole('region', { name: 'Synthèse du mois' })).toBeInTheDocument();
  });

  it.each([
    ['404', new ApiError(404, 'Not found')],
    ['500', new ApiError(500, 'Boom')],
    ['network', new NetworkError()],
  ])('hides the card without noise when the endpoint fails (%s)', async (_label, failure) => {
    api.fetchInsights.mockRejectedValue(failure);
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    await waitFor(() => expect(api.fetchInsights).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Prochaines actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the card when there is nothing to say', async () => {
    api.fetchInsights.mockResolvedValue([]);
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    expect(screen.queryByRole('region', { name: 'Prochaines actions' })).not.toBeInTheDocument();
  });
});
