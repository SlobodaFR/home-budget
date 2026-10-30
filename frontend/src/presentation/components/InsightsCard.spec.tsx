import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Insight } from '../../domain/insights';
import { InsightsCard } from './InsightsCard';

const insight = (overrides: Partial<Insight> = {}): Insight => ({
  id: 'recurring-missing',
  severity: 'ACTION',
  title: '2 paiements récurrents introuvables',
  detail: 'Loyer (5 nov.) est attendu mais absent. Importez votre relevé.',
  lesson: 4,
  link: '/import',
  ...overrides,
});

const renderCard = (state: Parameters<typeof InsightsCard>[0]['state']) =>
  render(
    <MemoryRouter>
      <InsightsCard state={state} />
    </MemoryRouter>,
  );

describe('InsightsCard', () => {
  it('shows title, detail, lesson mention and a button to the linked route', () => {
    renderCard({ status: 'ready', insights: [insight()] });
    expect(screen.getByRole('region', { name: 'Prochaines actions' })).toBeInTheDocument();
    expect(screen.getByText('2 paiements récurrents introuvables')).toBeInTheDocument();
    expect(screen.getByText(/Importez votre relevé/)).toBeInTheDocument();
    expect(screen.getByText('Leçon 4 du cours')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importer un relevé' })).toHaveAttribute('href', '/import');
  });

  it('labels each severity for screen readers', () => {
    const insights = [
      insight({ id: 'a', severity: 'WARNING', title: 'Alerte' }),
      insight({ id: 'b', severity: 'ACTION', title: 'Action' }),
      insight({ id: 'c', severity: 'INFO', title: 'Info' }),
      insight({ id: 'd', severity: 'GOOD', title: 'Bravo' }),
    ];
    renderCard({ status: 'ready', insights });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText(/Attention/)).toBeInTheDocument();
    expect(within(items[1]).getByText(/À faire/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/Bon à savoir/)).toBeInTheDocument();
    expect(within(items[3]).getByText(/Bien joué/)).toBeInTheDocument();
  });

  it('omits the button and the lesson when the insight has neither', () => {
    renderCard({ status: 'ready', insights: [insight({ lesson: null, link: null })] });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/Leçon/)).not.toBeInTheDocument();
  });

  it('gives the home link no button', () => {
    renderCard({ status: 'ready', insights: [insight({ link: '/' })] });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder', () => {
    renderCard({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Chargement des conseils' })).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = renderCard({ status: 'hidden' });
    expect(container).toBeEmptyDOMElement();
  });
});
