import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { account, debt, project } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  fetchTransactions: vi.fn(),
  fetchInsights: vi.fn(),
  deleteTransaction: vi.fn(),
  createTransaction: vi.fn(),
  fetchAccounts: vi.fn(),
  fetchProjects: vi.fn(),
  fetchDebts: vi.fn(),
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
    api.fetchAccounts.mockResolvedValue([]);
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

describe('HomePage bank accounts', () => {
  const transaction = (id: string, accountId: string | null) => ({
    id,
    spaceId: 's-common',
    kind: 'EXPENSE',
    bloc: 'COURANT',
    label: `Courses ${id}`,
    amountCents: 4200,
    date: '2026-11-03T00:00:00.000Z',
    accountId,
  });

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchInsights.mockResolvedValue([]);
    api.fetchTransactions.mockResolvedValue([transaction('t1', 'a1'), transaction('t2', null)]);
    api.fetchAccounts.mockResolvedValue([
      account({ id: 'a1', name: 'Compte commun', balanceCents: 98450 }),
      account({ id: 'a2', name: 'Courant de Thomas', balanceCents: 8000, projectedMonthEndCents: -4500 }),
      account({ id: 'a3', name: 'Ancien', archived: true }),
    ]);
  });

  it('summarises the balances of the active accounts with a link to manage them', async () => {
    renderInApp(<HomePage />);
    const section = await screen.findByRole('region', { name: 'Soldes des comptes' });
    const rows = within(section).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Compte commun.*984,50\s€/);
    expect(rows[1]).toHaveTextContent('sous zéro avant la fin du mois');
    expect(within(section).getByRole('link', { name: 'Gérer mes comptes' })).toHaveAttribute('href', '/comptes');
  });

  it('shows the account of each operation as a chip, only when the space has accounts', async () => {
    renderInApp(<HomePage />);
    const rows = await screen.findAllByRole('button', { name: /Modifier Courses/ });
    expect(rows[0]).toHaveTextContent('Compte : Compte commun');
    expect(rows[1]).not.toHaveTextContent('Compte :');
  });

  it('shows no summary and no chip without accounts, but still links to the accounts page', async () => {
    api.fetchAccounts.mockResolvedValue([]);
    renderInApp(<HomePage />);
    await screen.findAllByRole('button', { name: /Modifier Courses/ });
    expect(screen.queryByRole('region', { name: 'Soldes des comptes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Compte :/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes comptes' })).toHaveAttribute('href', '/comptes');
  });

  it('keeps the home page usable when the accounts endpoint fails', async () => {
    api.fetchAccounts.mockRejectedValue(new ApiError(404, 'nope'));
    renderInApp(<HomePage />);
    expect(await screen.findByRole('region', { name: 'Synthèse du mois' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Soldes des comptes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers the accounts page from an insight', async () => {
    api.fetchInsights.mockResolvedValue([
      { id: 'account-negative-projected', severity: 'WARNING', title: 'Un compte passerait sous zéro', detail: 'Courant de Thomas', lesson: 3, link: '/comptes' },
    ]);
    renderInApp(<HomePage />);
    expect(await screen.findByRole('link', { name: 'Voir mes comptes' })).toHaveAttribute('href', '/comptes');
  });
});

describe('HomePage projects card', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchInsights.mockResolvedValue([]);
    api.fetchTransactions.mockResolvedValue([]);
  });

  const plain = (value: string | null) => (value ?? '').replace(/[\s\u00a0\u202f]/g, ' ');

  it('shows the three projects closest to their due date, with status, progress and a link', async () => {
    api.fetchProjects.mockResolvedValue([
      project({ id: 'p4', name: 'Dans deux ans', targetDate: '2028-10-01' }),
      project({ id: 'p1', name: 'Vacances', targetDate: '2027-07-01' }),
      project({ id: 'p2', name: 'Voiture', targetDate: '2027-12-01', status: 'ON_TRACK' }),
      project({ id: 'p3', name: 'Travaux', targetDate: '2028-03-01', status: 'AHEAD' }),
      project({ id: 'p5', name: 'Fini', targetDate: '2026-12-01', status: 'DONE', remainingCents: 0 }),
      project({ id: 'p6', name: 'Rangé', targetDate: '2026-11-01', archived: true }),
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Mes projets' });
    const items = within(card).getAllByTestId('home-project');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual(['Vacances', 'Voiture', 'Travaux']);
    expect(within(items[0]).getByText('En retard')).toBeInTheDocument();
    expect(within(items[1]).getByText('À jour')).toBeInTheDocument();
    expect(within(items[2]).getByText('En avance')).toBeInTheDocument();
    expect(plain(items[0].textContent)).toContain('13 % — 400 € sur 3 000 €');
    expect(within(card).getByRole('link', { name: 'Voir mes projets' })).toHaveAttribute('href', '/projets');
    expect(api.fetchProjects).toHaveBeenCalledWith('s-common');
  });

  it('invites to create a first project when there is none', async () => {
    api.fetchProjects.mockResolvedValue([]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Mes projets' });
    expect(card).toHaveTextContent('Un projet daté vous dit combien mettre de côté');
    expect(within(card).getByRole('link', { name: 'Créer un projet' })).toHaveAttribute('href', '/projets');
  });

  it('says so when every project is reached or archived', async () => {
    api.fetchProjects.mockResolvedValue([project({ status: 'DONE', remainingCents: 0 }), project({ id: 'p2', archived: true })]);
    renderInApp(<HomePage />);
    expect(await screen.findByText(/Aucun projet en cours/)).toBeInTheDocument();
  });

  it('keeps a plain link to the projects page near the other shortcuts', async () => {
    api.fetchProjects.mockResolvedValue([]);
    renderInApp(<HomePage />);
    expect(screen.getByRole('link', { name: 'Mes projets' })).toHaveAttribute('href', '/projets');
    await screen.findByRole('region', { name: 'Mes projets' });
  });

  it.each([
    ['404', new ApiError(404, 'nope')],
    ['500', new ApiError(500, 'boom')],
    ['network', new NetworkError()],
  ])('hides the card without noise when the endpoint fails (%s)', async (_label, failure) => {
    api.fetchProjects.mockRejectedValue(failure);
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    await waitFor(() => expect(api.fetchProjects).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Mes projets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers the projects page from the insights', async () => {
    api.fetchProjects.mockResolvedValue([]);
    api.fetchInsights.mockResolvedValue([
      { id: 'project-behind', severity: 'WARNING', title: 'Vacances est en retard', detail: 'Il manque 350 €.', lesson: 2, link: '/projets' },
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Prochaines actions' });
    expect(within(card).getByRole('link', { name: 'Voir mes projets' })).toHaveAttribute('href', '/projets');
  });
});

describe('HomePage monthly review', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchTransactions.mockResolvedValue([]);
    api.fetchInsights.mockResolvedValue([]);
  });

  it('always links to the review page from the quick links', async () => {
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    expect(screen.getByRole('link', { name: 'Ma revue du mois' })).toHaveAttribute('href', '/revue');
  });

  it('always links to the trends page from the quick links', async () => {
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    expect(screen.getByRole('link', { name: 'Mes tendances' })).toHaveAttribute('href', '/tendances');
  });

  it('offers to make the review from the monthly-review insight', async () => {
    api.fetchInsights.mockResolvedValue([
      { id: 'monthly-review', severity: 'ACTION', title: 'Faites votre revue d’octobre', detail: 'Dix minutes suffisent.', lesson: 5, link: '/revue' },
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Prochaines actions' });
    expect(within(card).getByRole('link', { name: 'Faire ma revue' })).toHaveAttribute('href', '/revue');
  });

  it('offers to see the review once done', async () => {
    api.fetchInsights.mockResolvedValue([
      { id: 'review-done', severity: 'GOOD', title: 'Revue d’octobre terminée', detail: 'Décision : une liste.', lesson: null, link: '/revue' },
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Prochaines actions' });
    expect(within(card).getByRole('link', { name: 'Voir ma revue' })).toHaveAttribute('href', '/revue');
  });
});

describe('HomePage credits link', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchSummary.mockResolvedValue(summary);
    api.fetchTransactions.mockResolvedValue([]);
    api.fetchInsights.mockResolvedValue([]);
  });

  it('links to the credits only when the space has some', async () => {
    api.fetchDebts.mockResolvedValue([debt()]);
    renderInApp(<HomePage />);
    expect(await screen.findByRole('link', { name: 'Mes crédits' })).toHaveAttribute('href', '/dettes');
    expect(api.fetchDebts).toHaveBeenCalledWith('s-common');
  });

  it('shows no link when there is no credit', async () => {
    api.fetchDebts.mockResolvedValue([]);
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    await waitFor(() => expect(api.fetchDebts).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Mes crédits' })).not.toBeInTheDocument();
  });

  it('shows no link and no error when the endpoint fails', async () => {
    api.fetchDebts.mockRejectedValue(new ApiError(404, 'nope'));
    renderInApp(<HomePage />);
    await screen.findByRole('region', { name: 'Synthèse du mois' });
    await waitFor(() => expect(api.fetchDebts).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Mes crédits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers to see the credits from the debt insights', async () => {
    api.fetchDebts.mockResolvedValue([]);
    api.fetchInsights.mockResolvedValue([
      { id: 'debt-never-paid-off', severity: 'ACTION', title: 'Un crédit ne diminue pas', detail: 'La mensualité ne couvre pas les intérêts.', lesson: 6, link: '/dettes' },
    ]);
    renderInApp(<HomePage />);
    const card = await screen.findByRole('region', { name: 'Prochaines actions' });
    expect(within(card).getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/dettes');
  });
});
