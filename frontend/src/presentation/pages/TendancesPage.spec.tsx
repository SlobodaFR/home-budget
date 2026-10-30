import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTrends } from '../../domain/trends';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({ fetchTrends: vi.fn(), fetchAccounts: vi.fn() }));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { TendancesPage } from './TendancesPage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const blocs = { FIXE: 171000, COURANT: 142000, PLAISIR: 38000, EPARGNE: 0 };
const trends = parseTrends({
  from: '2026-05',
  to: '2026-10',
  months: [
    { month: '2026-05', incomeCents: 380000, expenseCents: 300000, balanceCents: 80000, savingsRatePercent: 21, blocs },
    { month: '2026-06', incomeCents: 380000, expenseCents: 340000, balanceCents: 40000, savingsRatePercent: 11, blocs },
    { month: '2026-07', incomeCents: 380000, expenseCents: 380000, balanceCents: 0, savingsRatePercent: 0, blocs },
    { month: '2026-08', incomeCents: 370000, expenseCents: 400000, balanceCents: -30000, savingsRatePercent: -8, blocs },
    { month: '2026-09', incomeCents: 380000, expenseCents: 340000, balanceCents: 40000, savingsRatePercent: 11, blocs },
    { month: '2026-10', incomeCents: 380000, expenseCents: 351000, balanceCents: 29000, savingsRatePercent: 8, blocs },
  ],
  averages: { incomeCents: 378333, expenseCents: 351833, savingsRatePercent: 7 },
  topLabels: [
    { label: 'Courses', totalCents: 820000, monthlyAverageCents: 136666, trendPercent: 12 },
    { label: 'Loyer', totalCents: 720000, monthlyAverageCents: 120000, trendPercent: 0 },
    { label: 'Essence', totalCents: 150000, monthlyAverageCents: 25000, trendPercent: -18 },
    { label: 'Cinéma', totalCents: 12000, monthlyAverageCents: 2000, trendPercent: null },
  ],
  risers: [{ label: 'Restaurant', recentAverageCents: 9000, previousAverageCents: 5000, deltaCents: 4000 }],
});

const renderPage = (kind: 'COMMON' | 'PERSONAL' = 'COMMON') => renderInApp(<TendancesPage />, { path: '/tendances', kind });

describe('TendancesPage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchTrends.mockResolvedValue(trends);
  });

  it('loads six months of the selected space by default', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Tendances communes' })).toBeInTheDocument();
    await screen.findByRole('region', { name: 'Taux d’épargne moyen' });
    expect(api.fetchTrends).toHaveBeenCalledWith('s-common', 6);
    expect(screen.getByRole('button', { name: '6 mois' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/');
  });

  it('titles the personal space differently and loads its trends', async () => {
    renderPage('PERSONAL');
    expect(await screen.findByRole('heading', { name: 'Tendances perso' })).toBeInTheDocument();
    await waitFor(() => expect(api.fetchTrends).toHaveBeenCalledWith('s-alice', 6));
  });

  it('switches the window between 3, 6 and 12 months', async () => {
    const user = renderPage();
    await screen.findByRole('region', { name: 'Taux d’épargne moyen' });
    expect(screen.getAllByRole('button', { name: /\d+ mois/ }).map((button) => button.textContent)).toEqual(['3 mois', '6 mois', '12 mois']);
    await user.click(screen.getByRole('button', { name: '12 mois' }));
    await waitFor(() => expect(api.fetchTrends).toHaveBeenLastCalledWith('s-common', 12));
    expect(screen.getByRole('button', { name: '12 mois' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '3 mois' }));
    await waitFor(() => expect(api.fetchTrends).toHaveBeenLastCalledWith('s-common', 3));
  });

  it('shows the average savings rate with a teaching sentence', async () => {
    renderPage();
    const section = await screen.findByRole('region', { name: 'Taux d’épargne moyen' });
    expect(section).toHaveTextContent('7 %');
    expect(screen.getByTestId('savings-sentence')).toHaveTextContent('En moyenne sur 6 mois, il vous reste 7 % de vos revenus après les dépenses.');
    const text = plain(section.textContent);
    expect(text).toContain('3 783 €');
    expect(text).toContain('3 518 €');
    expect(text).toContain('de mai 2026 à octobre 2026');
  });

  it('draws both charts with a complete alternative text, and no bar for a zero balance', async () => {
    renderPage();
    const chart = await screen.findByTestId('income-expense-chart');
    expect(chart).toHaveAttribute('role', 'img');
    const label = plain(chart.getAttribute('aria-label'));
    expect(label).toContain('mai 2026 : revenus 3 800 €, dépenses 3 000 €');
    expect(label).toContain('octobre 2026 : revenus 3 800 €, dépenses 3 510 €');
    expect(within(chart).getAllByTestId('income-bar')).toHaveLength(6);
    expect(within(chart).getAllByTestId('expense-bar')).toHaveLength(6);
    expect(within(chart).getAllByTestId('income-bar')[0]).toHaveStyle({ height: '95%' });
    expect(within(chart).getAllByTestId('expense-bar')[3]).toHaveStyle({ height: '100%' });
    const balance = screen.getByTestId('balance-chart');
    const balanceLabel = plain(balance.getAttribute('aria-label'));
    expect(balanceLabel).toContain('mai 2026 : solde positif de 800 €');
    expect(balanceLabel).toContain('juillet 2026 : solde à l’équilibre');
    expect(balanceLabel).toContain('août 2026 : solde négatif de 300 €');
    expect(within(balance).getAllByTestId('balance-bar-positive')).toHaveLength(4);
    expect(within(balance).getAllByTestId('balance-bar-negative')).toHaveLength(1);
  });

  it('explains the chart legend in words, not only by colour', async () => {
    renderPage();
    await screen.findByTestId('income-expense-chart');
    expect(screen.getByText('Revenus (barre pleine)')).toBeInTheDocument();
    expect(screen.getByText('Dépenses (barre hachurée)')).toBeInTheDocument();
    expect(screen.getByText('Solde positif (barre pleine, vers le haut)')).toBeInTheDocument();
    expect(screen.getByText('Solde négatif (barre hachurée, vers le bas)')).toBeInTheDocument();
  });

  it('offers the figures as a table', async () => {
    const user = renderPage();
    await screen.findByTestId('income-expense-chart');
    const details = screen.getByText('Voir les chiffres mois par mois').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText('Voir les chiffres mois par mois'));
    const table = within(details).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(plain(within(table).getByRole('row', { name: /août 2026/ }).textContent)).toContain('− 300 €');
  });

  it('lists where the money goes with total, monthly average and the trend in words and icon', async () => {
    renderPage();
    const section = await screen.findByRole('region', { name: 'Où va l’argent' });
    const items = within(section).getAllByTestId('top-label');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Courses');
    expect(plain(items[0].textContent)).toContain('8 200 €');
    expect(plain(items[0].textContent)).toContain('Environ 1 367 € par mois');
    expect(within(items[0]).getByText('En hausse de 12 %').closest('span')).toHaveAttribute('data-direction', 'up');
    expect(within(items[1]).getByText('Stable')).toBeInTheDocument();
    expect(within(items[2]).getByText('En baisse de 18 %').closest('span')).toHaveAttribute('data-direction', 'down');
    expect(within(items[2]).getByText('En baisse de 18 %').closest('span')?.querySelector('svg')).not.toBeNull();
    expect(within(items[3]).getByText('Pas de comparaison possible')).toBeInTheDocument();
    expect(section).toHaveTextContent('moitié la plus récente');
  });

  it('lists what is rising as « passe de X à Y par mois »', async () => {
    renderPage();
    const section = await screen.findByRole('region', { name: 'Dépenses en hausse' });
    expect(section).toHaveTextContent('En hausse');
    const [item] = within(section).getAllByTestId('riser');
    expect(item).toHaveTextContent('Restaurant');
    expect(plain(item.textContent)).toContain('Passe de 50 € à 90 € par mois (+ 40 € par mois).');
  });

  it('reassures when nothing is rising', async () => {
    api.fetchTrends.mockResolvedValue({ ...trends, risers: [] });
    renderPage();
    const section = await screen.findByRole('region', { name: 'Dépenses en hausse' });
    expect(section).toHaveTextContent('Rien ne grimpe de façon marquée');
    expect(within(section).queryByTestId('riser')).not.toBeInTheDocument();
  });

  it('explains that 3 months are too few to spot a rise', async () => {
    api.fetchTrends.mockResolvedValue(parseTrends({ months: trends.months.slice(0, 3), risers: [] }));
    renderPage();
    expect(await screen.findByText(/Il faut au moins 4 mois/)).toBeInTheDocument();
  });

  it('shows a welcoming message when there is no operation at all', async () => {
    api.fetchTrends.mockResolvedValue(parseTrends({ months: [{ month: '2026-10', incomeCents: 0, expenseCents: 0 }] }));
    renderPage();
    expect(await screen.findByText('Pas encore de tendances')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importer un relevé' })).toHaveAttribute('href', '/import');
    expect(screen.queryByTestId('income-expense-chart')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 mois' })).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    api.fetchTrends.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(trends);
    const user = renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les tendances');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('region', { name: 'Taux d’épargne moyen' })).toBeInTheDocument();
  });

  it('reports being offline, keeps the window choice, and reloads when the network is back', async () => {
    api.fetchTrends.mockRejectedValueOnce(new NetworkError()).mockResolvedValue(trends);
    renderPage();
    expect(await screen.findByText(/Hors ligne : vos tendances reviendront avec le réseau/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 mois' })).toBeInTheDocument();
    window.dispatchEvent(new Event('online'));
    expect(await screen.findByRole('region', { name: 'Taux d’épargne moyen' })).toBeInTheDocument();
  });
});
