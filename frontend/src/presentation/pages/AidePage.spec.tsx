import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { AidRule } from '../../domain/aids';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { lifeEventCatalog } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchAidRules: vi.fn(),
  fetchLifeEventCatalog: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { AidePage } from './AidePage';

const rule: AidRule = {
  id: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
  label: 'Garde d’enfants de moins de 6 ans hors du domicile',
  description: 'Crèche, assistante maternelle agréée, halte-garderie.',
  ratePercent: 50,
  capDescription: '3 500 € de frais par enfant de moins de 6 ans',
  cashTiming: 'Versé l’été de l’année suivante.',
  sourceLabel: 'impots.gouv.fr',
  sourceUrl: 'https://www.impots.gouv.fr/particulier/questions/garde',
  verifiedOn: '2026-10-30',
};

const renderPage = () => renderInApp(<AidePage />, { path: '/aide' });

function renderWithoutHousehold() {
  const value: HouseholdContextValue = { household: null, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter initialEntries={['/aide']}>
      <HouseholdContext.Provider value={value}>
        <AidePage />
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

const search = async (user: ReturnType<typeof userEvent.setup>, text: string) => user.type(screen.getByRole('searchbox', { name: 'Rechercher dans l’aide' }), text);
const sectionHeading = (name: string) => screen.getByRole('heading', { level: 2, name });

describe('AidePage', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAidRules.mockResolvedValue([rule]);
    api.fetchLifeEventCatalog.mockResolvedValue(lifeEventCatalog());
    api.fetchAccounts.mockResolvedValue([]);
  });

  describe('structure', () => {
    it('lists the nine sections as headings (h2) and in the table of contents, with working anchors', async () => {
      renderPage();
      const toc = screen.getByRole('navigation', { name: 'Sommaire' });
      const links = within(toc).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        '1.Pour commencer',
        '2.Le suivi au quotidien',
        '3.Épargne et projets',
        '4.Aides et démarches',
        '5.Mes données et ma confidentialité',
        '6.Règles officielles et sources',
        '7.Ce qui est prévu',
        '8.Questions fréquentes',
        '9.À propos',
      ]);
      links.forEach((link) => {
        const target = document.getElementById((link.getAttribute('href') ?? '').slice(1));
        expect(target, link.textContent ?? '').not.toBeNull();
        expect(target?.tagName).toBe('SECTION');
        expect(target).toHaveAccessibleName(link.textContent?.replace(/^\d+\./, '') ?? '');
      });
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(10); // 9 sections + « Sommaire »
      await screen.findByText('Garde d’enfants de moins de 6 ans hors du domicile');
    });

    it('never skips a heading level: h2 for sections, h3 for entries, h4 under a group', async () => {
      renderPage();
      await screen.findByText('Garde d’enfants de moins de 6 ans hors du domicile');
      expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0); // le h1 est porté par la mise en page
      expect(within(sectionHeading('Pour commencer').closest('section') as HTMLElement).getByRole('heading', { level: 3, name: 'Le foyer' })).toBeInTheDocument();
      const rules = sectionHeading('Règles officielles et sources').closest('section') as HTMLElement;
      expect(within(rules).getByRole('heading', { level: 3, name: 'Aides et crédits d’impôt' })).toBeInTheDocument();
      expect(within(rules).getByRole('heading', { level: 4, name: 'Garde d’enfants de moins de 6 ans hors du domicile' })).toBeInTheDocument();
    });

    it('offers a way back to the table of contents from every section', () => {
      renderPage();
      const backLinks = screen.getAllByRole('link', { name: 'Retour au sommaire' });
      expect(backLinks).toHaveLength(9);
      backLinks.forEach((link) => expect(link).toHaveAttribute('href', '#sommaire'));
      expect(document.getElementById('sommaire')).not.toBeNull();
    });

    it('goes back to the Foyer page when the user has a household', () => {
      renderPage();
      expect(screen.getByRole('link', { name: 'Foyer' })).toHaveAttribute('href', '/foyer');
    });

    it('says the help can be read offline', () => {
      renderPage();
      expect(screen.getByText(/Rien à installer de plus : cette aide est incluse dans l’application, vous pouvez la lire sans réseau/)).toBeInTheDocument();
    });
  });

  describe('internal links', () => {
    it('points to known screens when the user has a household', () => {
      renderPage();
      expect(screen.getAllByRole('link', { name: 'Ouvrir les projets' })[0]).toHaveAttribute('href', '/projets');
      expect(screen.getAllByRole('link', { name: 'Ouvrir le prévisionnel' })[0]).toHaveAttribute('href', '/previsionnel');
      expect(screen.getAllByRole('link', { name: 'Ouvrir le plan' })[0]).toHaveAttribute('href', '/plan');
    });

    it('hides them without a household (they would only lead back to the welcome page) and explains why', () => {
      renderWithoutHousehold();
      expect(screen.queryByRole('link', { name: /^Ouvrir/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Vous n’avez pas encore de foyer/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Bienvenue' })).toHaveAttribute('href', '/bienvenue');
      // le contenu, lui, est bien là
      expect(sectionHeading('Pour commencer')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Le foyer' })).toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('filters without caring about case or accents, and shows only the matching sections in the table of contents', async () => {
      const user = renderPage();
      await search(user, 'CRECHE');
      const toc = screen.getByRole('navigation', { name: 'Sommaire' });
      const titles = within(toc)
        .getAllByRole('link')
        .map((link) => link.textContent?.replace(/^\d+\./, ''));
      expect(titles).toContain('Aides et démarches');
      expect(titles).toContain('Règles officielles et sources');
      expect(titles).not.toContain('Pour commencer');
      expect(screen.queryByRole('heading', { level: 2, name: 'Pour commencer' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Estimer le tarif d’une crèche' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 3, name: 'Le foyer' })).not.toBeInTheDocument();
    });

    it('announces how many results were found', async () => {
      const user = renderPage();
      await search(user, 'chiffrement');
      expect(screen.getByText(/\d+ résultats? dans \d+ rubriques?\./)).toBeInTheDocument();
    });

    it('finds a word that only appears in a keyword or a list item', async () => {
      const user = renderPage();
      await search(user, 'taxe fonciere');
      expect(screen.getByRole('heading', { level: 3, name: /Provisions/ })).toBeInTheDocument();
    });

    it('also searches the rules that came from the server', async () => {
      const user = renderPage();
      await screen.findByText('Garde d’enfants de moins de 6 ans hors du domicile');
      await search(user, 'assistante maternelle');
      expect(screen.getByRole('heading', { level: 4, name: 'Garde d’enfants de moins de 6 ans hors du domicile' })).toBeInTheDocument();
    });

    it('shows a message when nothing matches, and the clear button brings everything back', async () => {
      const user = renderPage();
      await search(user, 'zzzzqx');
      expect(screen.getByText('Aucun résultat pour « zzzzqx ».')).toBeInTheDocument();
      expect(screen.getByText(/Aucun résultat\. Essayez un mot plus court/)).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Sommaire' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Voir toute l’aide' }));
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(10);
      expect(screen.getByRole('searchbox')).toHaveValue('');
    });

    it('expands the answers of the questions that match', async () => {
      const user = renderPage();
      await search(user, 'invitation');
      const question = screen.getByRole('button', { name: 'Mon code d’invitation ne marche pas' });
      expect(question).toHaveAttribute('aria-expanded', 'true');
    });

    it('lets the user read the help without typing anything: no result line', () => {
      renderPage();
      expect(screen.queryByText(/résultats? dans/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Aucun résultat/)).not.toBeInTheDocument();
    });
  });

  describe('questions fréquentes (accordion)', () => {
    const faqRegion = () => sectionHeading('Questions fréquentes').closest('section') as HTMLElement;

    it('has at least ten collapsed questions, each a button wired to its answer region', () => {
      renderPage();
      const buttons = within(faqRegion()).getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(10);
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-expanded', 'false');
        const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
        expect(panel).not.toBeNull();
        expect(panel).toHaveAttribute('role', 'region');
        expect(panel).toHaveAttribute('aria-labelledby', button.id);
        expect(panel).not.toBeVisible();
      });
    });

    it('puts each question button inside a heading (h3)', () => {
      renderPage();
      expect(within(faqRegion()).getByRole('heading', { level: 3, name: 'Ma contribution est-elle obligatoire ?' })).toBeInTheDocument();
    });

    it('opens and closes an answer with the button, independently of the others', async () => {
      const user = renderPage();
      const first = screen.getByRole('button', { name: 'Pourquoi le commun a 0 € de revenus ?' });
      const second = screen.getByRole('button', { name: 'Ma contribution est-elle obligatoire ?' });
      await user.click(first);
      await user.click(second);
      expect(first).toHaveAttribute('aria-expanded', 'true');
      expect(second).toHaveAttribute('aria-expanded', 'true');
      const region = screen.getByRole('region', { name: 'Pourquoi le commun a 0 € de revenus ?' });
      expect(region).toBeVisible();
      expect(within(region).getByText(/n’a pas de salaire/)).toBeVisible();
      await user.click(first);
      expect(first).toHaveAttribute('aria-expanded', 'false');
      expect(second).toHaveAttribute('aria-expanded', 'true');
      expect(screen.queryByRole('region', { name: 'Pourquoi le commun a 0 € de revenus ?' })).not.toBeInTheDocument();
    });

    it('works with the keyboard', async () => {
      const user = renderPage();
      const button = screen.getByRole('button', { name: 'Puis-je supprimer mes données ?' });
      button.focus();
      await user.keyboard('{Enter}');
      expect(button).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard(' ');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('answers with what the application really does: no « delete my account » button', async () => {
      const user = renderPage();
      await user.click(screen.getByRole('button', { name: 'Puis-je supprimer mes données ?' }));
      const region = screen.getByRole('region', { name: 'Puis-je supprimer mes données ?' });
      expect(within(region).getByText(/pas encore de bouton pour supprimer tout votre compte/)).toBeInTheDocument();
    });
  });

  describe('official rules and sources', () => {
    const rulesSection = () => sectionHeading('Règles officielles et sources').closest('section') as HTMLElement;

    it('shows the banner, the two static rows and, from the server, the aid rules and the birth steps', async () => {
      renderPage();
      const section = rulesSection();
      expect(within(section).getByText('Ce sont des repères et des estimations, pas des conseils juridiques ou fiscaux.')).toBeInTheDocument();
      expect(within(section).getByRole('heading', { level: 4, name: 'Seuil d’endettement de 35 %' })).toBeInTheDocument();
      expect(within(section).getByRole('heading', { level: 4, name: 'Participation des crèches (barème de la Caf)' })).toBeInTheDocument();
      expect(within(section).getByText(/À confirmer chaque année/)).toBeInTheDocument();

      expect(await within(section).findByRole('heading', { level: 4, name: 'Garde d’enfants de moins de 6 ans hors du domicile' })).toBeInTheDocument();
      expect(within(section).getByText(/Taux : 50 % de crédit d’impôt\./)).toBeInTheDocument();
      expect(within(section).getByText(/Plafond : 3 500 € de frais par enfant de moins de 6 ans\./)).toBeInTheDocument();
      expect(within(section).getByText('Démarches : naissance d’un enfant')).toBeInTheDocument();
      expect(within(section).getAllByText(/vérifié le 30 octobre 2026/).length).toBeGreaterThanOrEqual(3);
      expect(api.fetchAidRules).toHaveBeenCalledTimes(1);
      expect(api.fetchLifeEventCatalog).toHaveBeenCalledTimes(1);
    });

    it('opens every source in a new tab, safely, and tells screen readers', async () => {
      renderPage();
      const section = rulesSection();
      const link = await within(section).findByRole('link', { name: /impots\.gouv\.fr/ });
      expect(link).toHaveAttribute('href', 'https://www.impots.gouv.fr/particulier/questions/garde');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAccessibleName('impots.gouv.fr (nouvel onglet)');
      const caf = within(section).getByRole('link', { name: /caf\.fr, guide/ });
      expect(caf).toHaveAttribute('href', expect.stringMatching(/^https:\/\/www\.caf\.fr\//));
      expect(caf).toHaveAttribute('rel', 'noopener noreferrer');
      const externals = within(section)
        .getAllByRole('link')
        .filter((item) => (item.getAttribute('href') ?? '').startsWith('http'));
      expect(externals.length).toBeGreaterThanOrEqual(4);
      for (const external of externals) {
        expect(external).toHaveAttribute('target', '_blank');
        expect(external).toHaveAccessibleName(/\(nouvel onglet\)$/);
      }
    });

    it('does not link a source whose address is not http(s)', async () => {
      api.fetchAidRules.mockResolvedValue([{ ...rule, sourceUrl: 'javascript:alert(1)', sourceLabel: 'Source douteuse' }]);
      renderPage();
      const section = rulesSection();
      await within(section).findByText('Source douteuse');
      expect(within(section).queryByRole('link', { name: /Source douteuse/ })).not.toBeInTheDocument();
    });

    it('explains that the 35 % threshold has no official source', () => {
      renderPage();
      const row = within(rulesSection()).getByRole('heading', { level: 4, name: 'Seuil d’endettement de 35 %' }).closest('article') as HTMLElement;
      expect(within(row).getByText(/pas une règle de droit/)).toBeInTheDocument();
      expect(within(row).getByText(/pas de date de vérification/)).toBeInTheDocument();
      expect(within(row).queryByRole('link', { name: /nouvel onglet/ })).not.toBeInTheDocument();
    });

    it('shows a quiet message when the server does not answer, and the rest of the page keeps working', async () => {
      api.fetchAidRules.mockRejectedValue(new ApiError(500, 'boom'));
      api.fetchLifeEventCatalog.mockRejectedValue(new ApiError(500, 'boom'));
      const user = renderPage();
      expect(await screen.findByText(/ne sont pas disponibles pour le moment/)).toBeInTheDocument();
      const section = rulesSection();
      expect(within(section).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(section).getByRole('heading', { level: 4, name: 'Seuil d’endettement de 35 %' })).toBeInTheDocument();
      expect(sectionHeading('Pour commencer')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Puis-je supprimer mes données ?' }));
      expect(screen.getByRole('button', { name: 'Puis-je supprimer mes données ?' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('says the user is offline, then retries by itself when the network is back', async () => {
      api.fetchAidRules.mockRejectedValueOnce(new NetworkError());
      api.fetchLifeEventCatalog.mockRejectedValueOnce(new NetworkError());
      renderPage();
      expect(await screen.findByText(/Vous êtes hors ligne/)).toBeInTheDocument();
      expect(sectionHeading('Pour commencer')).toBeInTheDocument();
      window.dispatchEvent(new Event('online'));
      expect(await screen.findByRole('heading', { level: 4, name: 'Garde d’enfants de moins de 6 ans hors du domicile' })).toBeInTheDocument();
      expect(screen.queryByText(/Vous êtes hors ligne/)).not.toBeInTheDocument();
    });

    it('lets the user retry by hand', async () => {
      api.fetchAidRules.mockRejectedValueOnce(new ApiError(503, 'down'));
      const user = renderPage();
      await screen.findByText(/ne sont pas disponibles pour le moment/);
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByRole('heading', { level: 4, name: 'Garde d’enfants de moins de 6 ans hors du domicile' })).toBeInTheDocument();
      expect(screen.queryByText(/ne sont pas disponibles pour le moment/)).not.toBeInTheDocument();
    });
  });

  describe('à propos', () => {
    it('shows the version taken from the package', () => {
      renderPage();
      const about = sectionHeading('À propos').closest('section') as HTMLElement;
      expect(within(about).getByText(/^Version \d+\.\d+\.\d+\.$/)).toBeInTheDocument();
    });
  });

});
