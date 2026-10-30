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

  it('sends a big upcoming payment to the provisions tab, with an info icon label', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({
          id: 'upcoming-big-payment',
          severity: 'INFO',
          title: 'Taxe foncière : 1 200,00 € le 15 novembre',
          detail: 'Mettez de côté 100,00 € par mois pour l’année prochaine.',
          lesson: 2,
          link: '/previsionnel',
        }),
      ],
    });
    const item = screen.getByRole('listitem');
    expect(within(item).getByText(/Bon à savoir/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Voir mes provisions' })).toHaveAttribute('href', '/previsionnel?vue=provisions');
    expect(within(item).getByText('Leçon 2 du cours')).toBeInTheDocument();
  });

  it('offers to adjust the plan for a provision suggestion', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({ id: 'provision-suggestion', severity: 'INFO', title: 'Prévoyez une provision', detail: 'Votre épargne prévue est plus basse.', lesson: 2, link: '/plan' }),
      ],
    });
    expect(screen.getByRole('link', { name: 'Ajuster mon plan' })).toHaveAttribute('href', '/plan');
  });

  it('sends the savings project insights to the projects page and to the plan, each with the right severity', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({ id: 'project-behind', severity: 'WARNING', title: 'Vacances est en retard', detail: 'Il manque 350 € : 325 € par mois.', lesson: 2, link: '/projets' }),
        insight({ id: 'projects-exceed-savings', severity: 'ACTION', title: 'Vos projets dépassent votre épargne prévue', detail: 'Il manque 115 € par mois.', lesson: 2, link: '/plan' }),
        insight({ id: 'project-reached', severity: 'GOOD', title: 'Voiture est atteint', detail: 'Bravo !', lesson: null, link: '/projets' }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(/Attention/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Voir mes projets' })).toHaveAttribute('href', '/projets');
    expect(within(items[1]).getByText(/À faire/)).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Ajuster mon plan' })).toHaveAttribute('href', '/plan');
    expect(within(items[2]).getByText(/Bien joué/)).toBeInTheDocument();
    expect(within(items[2]).getByRole('link', { name: 'Voir mes projets' })).toHaveAttribute('href', '/projets');
  });

  it('sends the monthly review insights to /revue with the right button label', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({ id: 'monthly-review', severity: 'ACTION', title: 'Faites votre revue d’octobre', detail: 'Dix minutes suffisent.', lesson: 5, link: '/revue' }),
        insight({ id: 'review-done', severity: 'GOOD', title: 'Revue d’octobre terminée', detail: 'Décision : fixer 400 € pour les courses.', lesson: null, link: '/revue' }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(/À faire/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Faire ma revue' })).toHaveAttribute('href', '/revue');
    expect(within(items[1]).getByText(/Bien joué/)).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Voir ma revue' })).toHaveAttribute('href', '/revue');
    expect(within(items[1]).getByText(/fixer 400 € pour les courses/)).toBeInTheDocument();
  });

  it('sends the debt insights to /dettes with « Voir mes crédits », each with the right severity', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({ id: 'debt-ratio-high', severity: 'WARNING', title: 'Vos mensualités dépassent 35 % de vos revenus', detail: 'C’est un repère courant, pas une règle de droit.', lesson: 6, link: '/dettes' }),
        insight({ id: 'debt-never-paid-off', severity: 'ACTION', title: 'Un crédit ne diminue pas', detail: 'La mensualité ne couvre pas les intérêts.', lesson: 6, link: '/dettes' }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(/Attention/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/dettes');
    expect(within(items[1]).getByText(/À faire/)).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Voir mes crédits' })).toHaveAttribute('href', '/dettes');
  });

  it('sends the life event insights to /evenements with « Voir mes démarches », each with the right severity', () => {
    renderCard({
      status: 'ready',
      insights: [
        insight({ id: 'life-event-overdue', severity: 'WARNING', title: '2 démarches de naissance en retard', detail: 'Déclarer la grossesse, Chercher un mode d’accueil.', lesson: null, link: '/evenements' }),
        insight({ id: 'life-event-due-soon', severity: 'ACTION', title: '3 démarches de naissance à faire sous 14 jours', detail: 'Déclarer la naissance à la mairie.', lesson: null, link: '/evenements' }),
      ],
    });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText(/Attention/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'Voir mes démarches' })).toHaveAttribute('href', '/evenements');
    expect(within(items[1]).getByText(/À faire/)).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Voir mes démarches' })).toHaveAttribute('href', '/evenements');
  });

  it('sends the spending-riser insight to /tendances with « Voir mes tendances »', () => {
    renderCard({
      status: 'ready',
      insights: [insight({ id: 'spending-riser', severity: 'INFO', title: 'Restaurant grimpe', detail: 'Passe de 50 € à 120 € par mois.', lesson: null, link: '/tendances' })],
    });
    const item = screen.getByRole('listitem');
    expect(within(item).getByText(/Bon à savoir/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Voir mes tendances' })).toHaveAttribute('href', '/tendances');
  });

  it('sends the pending contribution insight to the foyer with « Verser ma contribution » (opens the card)', () => {
    renderCard({
      status: 'ready',
      insights: [insight({ id: 'contribution-pending', severity: 'ACTION', title: 'Votre contribution du mois reste à verser', detail: 'Il vous reste 550 € à verser au commun.', lesson: null, link: '/foyer' })],
    });
    const item = screen.getByRole('listitem');
    expect(within(item).getByText(/À faire/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Verser ma contribution' })).toHaveAttribute('href', '/foyer?verser=1');
  });

  it('keeps the generic « Ouvrir le foyer » for another insight linking to the foyer', () => {
    renderCard({ status: 'ready', insights: [insight({ id: 'safety-net-unset', severity: 'INFO', title: 'x', link: '/foyer' })] });
    expect(screen.getByRole('link', { name: 'Ouvrir le foyer' })).toHaveAttribute('href', '/foyer');
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
