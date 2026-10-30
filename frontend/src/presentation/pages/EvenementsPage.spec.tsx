import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../infrastructure/api-client';
import { lifeEvent, lifeEventCatalog, lifeEventStep } from '../../test/fixtures';
import { renderInApp } from '../../test/render-app';

const api = vi.hoisted(() => ({
  fetchLifeEvents: vi.fn(),
  fetchLifeEventCatalog: vi.fn(),
  createLifeEvent: vi.fn(),
  updateLifeEvent: vi.fn(),
  deleteLifeEvent: vi.fn(),
  setLifeEventStep: vi.fn(),
  fetchAccounts: vi.fn(),
}));

vi.mock('../../infrastructure/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../infrastructure/api-client')>()),
  apiClient: api,
}));

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'alice', email: 'alice@example.test', name: 'Alice' }, loading: false, logout: vi.fn() }),
}));

import { EvenementsPage } from './EvenementsPage';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

const renderPage = () => renderInApp(<EvenementsPage />, { path: '/evenements' });

const group = (name: string) => screen.getByRole('list', { name });
const groupItems = (name: string) => within(group(name)).getAllByTestId('life-step');

describe('EvenementsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 30, 12, 0, 0));
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccounts.mockResolvedValue([]);
    api.fetchLifeEvents.mockResolvedValue([lifeEvent()]);
    api.fetchLifeEventCatalog.mockResolvedValue(lifeEventCatalog());
    api.createLifeEvent.mockResolvedValue(lifeEvent());
    api.updateLifeEvent.mockResolvedValue(undefined);
    api.deleteLifeEvent.mockResolvedValue(undefined);
    api.setLifeEventStep.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('list', () => {
    it('is at household level: loads the events and the catalog without any space', async () => {
      renderPage();
      await screen.findByRole('list', { name: 'Événements de vie du foyer' });
      expect(api.fetchLifeEvents).toHaveBeenCalledWith();
      expect(api.fetchLifeEventCatalog).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { name: 'Événements de vie' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Accueil' })).toHaveAttribute('href', '/');
    });

    it('always shows the banner: reference points, not legal or tax advice', async () => {
      renderPage();
      expect(screen.getByText('Repères, pas conseils juridiques ou fiscaux : vérifiez sur la source officielle de chaque démarche.')).toBeInTheDocument();
      await screen.findByTestId('life-event');
      expect(screen.getByText(/Repères, pas conseils juridiques ou fiscaux/)).toBeInTheDocument();
    });

    it('shows the banner on the empty state and on errors too', async () => {
      api.fetchLifeEvents.mockResolvedValue([]);
      renderPage();
      await screen.findByText('À quoi servent les événements de vie ?');
      expect(screen.getByText(/Repères, pas conseils juridiques ou fiscaux/)).toBeInTheDocument();
    });

    it('shows the card: label, date, accessible progress and what is pressing', async () => {
      renderPage();
      const card = await screen.findByTestId('life-event');
      expect(within(card).getByRole('heading', { name: 'Naissance d’un enfant' })).toBeInTheDocument();
      expect(within(card).getByText('Naissance prévue le 31 octobre 2026')).toBeInTheDocument();
      expect(plain(card.textContent)).toContain('1 démarche sur 5 faite — 20 %');
      const bar = within(card).getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '20');
      expect(bar).toHaveAttribute('aria-valuetext', '1 démarche sur 5 faite — 20 %');
      expect(within(card).getByText('1 en retard · 1 à faire bientôt')).toBeInTheDocument();
    });

    it('groups the steps by status, in the order of the product, each step in the right group', async () => {
      renderPage();
      await screen.findByTestId('life-event');
      const headings = screen.getAllByRole('heading', { level: 4 }).map((heading) => plain(heading.textContent));
      expect(headings).toEqual(['En retard 1', 'À faire bientôt (14 jours) 1', 'À venir 1', 'Sans échéance fixe 1']);
      expect(groupItems('En retard')[0]).toHaveTextContent('Déclarer la grossesse');
      expect(groupItems('À faire bientôt (14 jours)')[0]).toHaveTextContent('Déclarer la naissance à la mairie');
      expect(groupItems('À venir')[0]).toHaveTextContent('Signaler la naissance aux impôts');
      expect(groupItems('Sans échéance fixe')[0]).toHaveTextContent('Déclarer la naissance à la Caf');
    });

    it('folds the done steps', async () => {
      const user = renderPage();
      await screen.findByTestId('life-event');
      const details = screen.getByText('Faites').closest('details') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      await user.click(screen.getByText('Faites'));
      expect(details.open).toBe(true);
      const done = within(details).getByTestId('life-step');
      expect(done).toHaveTextContent('Récupérer le livret de famille');
      expect(within(done).getByRole('checkbox')).toBeChecked();
      expect(within(done).getByText('Faite le 28 oct. 2026')).toBeInTheDocument();
    });

    it('shows the date of verification of each source, taken from the catalog', async () => {
      const user = renderPage();
      const item = (await screen.findAllByTestId('life-step'))[1];
      await waitFor(() => expect(api.fetchLifeEventCatalog).toHaveBeenCalled());
      await user.click(within(item).getByRole('button', { name: /Voir le détail/ }));
      expect(plain(item.textContent)).toContain('(vérifié le 30 octobre 2026)');
      const link = within(item).getByRole('link', { name: /service-public\.gouv\.fr/ });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('still works, without the verification date, when the catalog cannot be read', async () => {
      api.fetchLifeEventCatalog.mockRejectedValue(new ApiError(500, 'Boom'));
      const user = renderPage();
      const item = (await screen.findAllByTestId('life-step'))[1];
      await waitFor(() => expect(api.fetchLifeEventCatalog).toHaveBeenCalled());
      await user.click(within(item).getByRole('button', { name: /Voir le détail/ }));
      expect(within(item).getByText(/Source :/)).toBeInTheDocument();
      expect(screen.queryByText(/vérifié le/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('opens the useful screen from a step, for known routes only', async () => {
      api.fetchLifeEvents.mockResolvedValue([
        lifeEvent({ steps: [lifeEventStep({ link: '/previsionnel' }), lifeEventStep({ stepId: 'autre', title: 'Autre démarche', link: '/dettes' })] }),
      ]);
      const user = renderPage();
      const items = await screen.findAllByTestId('life-step');
      await user.click(within(items[0]).getByRole('button', { name: /Voir le détail/ }));
      await user.click(within(items[1]).getByRole('button', { name: /Voir le détail/ }));
      expect(within(items[0]).getByRole('link', { name: 'Voir le prévisionnel' })).toHaveAttribute('href', '/previsionnel');
      expect(within(items[1]).queryByRole('link', { name: /Voir|Ouvrir/ })).not.toBeInTheDocument();
    });

    it('lists several events, newest first, each with its own progress', async () => {
      api.fetchLifeEvents.mockResolvedValue([
        lifeEvent({ id: 'e2', label: 'Deuxième bébé', eventDate: '2027-03-01', steps: [lifeEventStep({ stepId: 'x', status: 'UPCOMING', dueDate: '2027-03-06' })] }),
        lifeEvent(),
      ]);
      renderPage();
      const cards = await screen.findAllByTestId('life-event');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent('Deuxième bébé');
      expect(plain(cards[0].textContent)).toContain('0 démarche sur 1 faite — 0 %');
      expect(plain(cards[1].textContent)).toContain('1 démarche sur 5 faite');
    });
  });

  describe('empty state', () => {
    beforeEach(() => {
      api.fetchLifeEvents.mockResolvedValue([]);
    });

    it('explains what it is for, what will be tracked, and offers to add a birth', async () => {
      renderPage();
      expect(await screen.findByText('À quoi servent les événements de vie ?')).toBeInTheDocument();
      expect(screen.getByText(/On vous liste les démarches, avec leur échéance/i)).toBeInTheDocument();
      expect(await screen.findByText('5 démarches suivies, chacune avec sa source officielle :')).toBeInTheDocument();
      const themes = within(screen.getByText(/démarches suivies/).parentElement as HTMLElement).getAllByRole('listitem');
      expect(themes.map((theme) => plain(theme.textContent))).toEqual(['Administratif (2)', 'Aides (1)', 'Santé (1)', 'Budget (1)']);
      expect(screen.getByRole('button', { name: 'Ajouter une naissance' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Événements de vie du foyer' })).not.toBeInTheDocument();
    });

    it('stays useful when the catalog is not there', async () => {
      api.fetchLifeEventCatalog.mockRejectedValue(new NetworkError());
      renderPage();
      expect(await screen.findByText('À quoi servent les événements de vie ?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ajouter une naissance' })).toBeInTheDocument();
      expect(screen.queryByText(/démarches suivies/)).not.toBeInTheDocument();
    });

    it('creates a birth from the date alone, then shows the list of steps right away', async () => {
      const created = lifeEvent({ id: 'e-new' });
      api.createLifeEvent.mockResolvedValue(created);
      api.fetchLifeEvents.mockResolvedValueOnce([]).mockResolvedValue([created]);
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter une naissance' }));
      const dialog = await screen.findByRole('dialog', { name: 'Ajouter une naissance' });
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2026-10-31' } });
      await user.click(within(dialog).getByRole('button', { name: 'Afficher mes démarches' }));
      await waitFor(() => expect(api.createLifeEvent).toHaveBeenCalledWith({ type: 'BIRTH', eventDate: '2026-10-31' }));
      expect(await screen.findByTestId('life-event')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Naissance ajoutée : voici vos démarches')).toBeInTheDocument();
      expect(screen.queryByText('À quoi servent les événements de vie ?')).not.toBeInTheDocument();
      await waitFor(() => expect(api.fetchLifeEvents).toHaveBeenCalledTimes(2));
    });

    it('creates a birth with its own label', async () => {
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter une naissance' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2027-02-10' } });
      await user.type(within(dialog).getByLabelText('Libellé (facultatif)'), 'Bébé de février');
      await user.click(within(dialog).getByRole('button', { name: 'Afficher mes démarches' }));
      await waitFor(() => expect(api.createLifeEvent).toHaveBeenCalledWith({ type: 'BIRTH', eventDate: '2027-02-10', label: 'Bébé de février' }));
    });

    it('keeps the form open, with an explanation, when the date is refused by the server', async () => {
      api.createLifeEvent.mockRejectedValue(new ApiError(400, 'date refusée'));
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter une naissance' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2026-10-31' } });
      await user.click(within(dialog).getByRole('button', { name: 'Afficher mes démarches' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('L’enregistrement a échoué. Vérifiez la date');
      expect(within(dialog).getByLabelText(/Date de naissance/)).toHaveValue('2026-10-31');
    });

    it('says clearly when there is no connection while creating', async () => {
      api.createLifeEvent.mockRejectedValue(new NetworkError());
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter une naissance' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2026-10-31' } });
      await user.click(within(dialog).getByRole('button', { name: 'Afficher mes démarches' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pas de connexion');
    });

    it('does not call the server for a date outside the window', async () => {
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Ajouter une naissance' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2030-01-01' } });
      await user.click(within(dialog).getByRole('button', { name: 'Afficher mes démarches' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('entre le 30 octobre 2024 et le 30 avril 2028');
      expect(api.createLifeEvent).not.toHaveBeenCalled();
    });
  });

  describe('ticking a step', () => {
    const tickDeclaration = async (user: ReturnType<typeof renderPage>) => {
      await screen.findByTestId('life-event');
      await user.click(screen.getByRole('checkbox', { name: 'Déclarer la naissance à la mairie' }));
    };

    it('ticks at once, saves, and moves the step to the folded « Faites » group', async () => {
      let release!: () => void;
      api.setLifeEventStep.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
      const user = renderPage();
      await tickDeclaration(user);
      expect(api.setLifeEventStep).toHaveBeenCalledWith('e1', 'birth-declaration', { done: true });
      expect(plain(screen.getByRole('progressbar').getAttribute('aria-valuetext'))).toBe('2 démarches sur 5 faites — 40 %');
      expect(within(screen.getByText('Faites').closest('details') as HTMLElement).getByText('Déclarer la naissance à la mairie')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'À faire bientôt (14 jours)' })).not.toBeInTheDocument();
      expect(screen.queryByText('Démarche faite. Retrouvez-la dans « Faites ».')).not.toBeInTheDocument();
      await act(async () => release());
      expect(await screen.findByText('Démarche faite. Retrouvez-la dans « Faites ».')).toBeInTheDocument();
      await waitFor(() => expect(api.fetchLifeEvents).toHaveBeenCalledTimes(2));
    });

    it('moves the focus to the progress, which announces the new total', async () => {
      const user = renderPage();
      await tickDeclaration(user);
      expect(screen.getByRole('progressbar').parentElement).toHaveFocus();
      expect(screen.getByRole('progressbar').parentElement?.querySelector('[aria-live="polite"]')).toHaveTextContent('2 démarches sur 5 faites — 40 %');
    });

    it('puts the box back and explains it when the server refuses', async () => {
      api.setLifeEventStep.mockRejectedValue(new ApiError(500, 'Boom'));
      const user = renderPage();
      await tickDeclaration(user);
      expect(await screen.findByText('Enregistrement impossible : la case est remise comme avant. Réessayez.')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Déclarer la naissance à la mairie' })).not.toBeChecked();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
      expect(groupItems('À faire bientôt (14 jours)')[0]).toHaveTextContent('Déclarer la naissance à la mairie');
      expect(api.fetchLifeEvents).toHaveBeenCalledTimes(1);
    });

    it('puts the box back and says there is no connection when offline', async () => {
      api.setLifeEventStep.mockRejectedValue(new NetworkError());
      const user = renderPage();
      await tickDeclaration(user);
      expect(await screen.findByText('Pas de connexion : la case est remise comme avant. Réessayez dès que le réseau est revenu.')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Déclarer la naissance à la mairie' })).not.toBeChecked();
    });

    it('unticks a done step: it goes back to its group, its note kept', async () => {
      const user = renderPage();
      await screen.findByTestId('life-event');
      await user.click(screen.getByText('Faites'));
      await user.click(screen.getByRole('checkbox', { name: 'Récupérer le livret de famille' }));
      expect(api.setLifeEventStep).toHaveBeenCalledWith('e1', 'birth-family-booklet', { done: false });
      expect(groupItems('Sans échéance fixe').map((item) => item.textContent)).toEqual(
        expect.arrayContaining([expect.stringContaining('Récupérer le livret de famille')]),
      );
      expect(screen.getByText('Démarche remise à faire.')).toBeInTheDocument();
      expect(screen.getByText('Récupéré à la mairie')).toBeInTheDocument();
    });

    it('puts an overdue step ticked then unticked back in « En retard » (status recomputed from its date)', async () => {
      const user = renderPage();
      await screen.findByTestId('life-event');
      await user.click(screen.getByRole('checkbox', { name: 'Déclarer la grossesse' }));
      expect(screen.queryByRole('list', { name: 'En retard' })).not.toBeInTheDocument();
      await user.click(screen.getByText('Faites'));
      await user.click(screen.getByRole('checkbox', { name: 'Déclarer la grossesse' }));
      expect(groupItems('En retard')[0]).toHaveTextContent('Déclarer la grossesse');
    });
  });

  describe('notes', () => {
    const openNote = async (user: ReturnType<typeof renderPage>, stepIndex = 1) => {
      const item = (await screen.findAllByTestId('life-step'))[stepIndex];
      await user.click(within(item).getByRole('button', { name: /Voir le détail/ }));
      await user.click(within(item).getByRole('button', { name: /Ajouter une note|Modifier la note/ }));
      return item;
    };

    it('saves a note without changing the box, and shows it', async () => {
      const user = renderPage();
      const item = await openNote(user);
      await user.type(within(item).getByRole('textbox'), 'RDV lundi à 9 h');
      await user.click(within(item).getByRole('button', { name: 'Enregistrer la note' }));
      await waitFor(() => expect(api.setLifeEventStep).toHaveBeenCalledWith('e1', 'birth-declaration', { done: false, note: 'RDV lundi à 9 h' }));
      expect(await screen.findByText('Note enregistrée')).toBeInTheDocument();
      expect(within(item).getByText('RDV lundi à 9 h')).toBeInTheDocument();
      expect(within(item).getByRole('checkbox')).not.toBeChecked();
    });

    it('keeps the typed note when there is no connection, and says so', async () => {
      api.setLifeEventStep.mockRejectedValue(new NetworkError());
      const user = renderPage();
      const item = await openNote(user);
      await user.type(within(item).getByRole('textbox'), 'À ne pas perdre');
      await user.click(within(item).getByRole('button', { name: 'Enregistrer la note' }));
      expect(await within(item).findByRole('alert')).toHaveTextContent('Pas de connexion : votre note reste ici');
      expect(within(item).getByRole('textbox')).toHaveValue('À ne pas perdre');
      api.setLifeEventStep.mockResolvedValue(undefined);
      await user.click(within(item).getByRole('button', { name: 'Enregistrer la note' }));
      await waitFor(() => expect(api.setLifeEventStep).toHaveBeenLastCalledWith('e1', 'birth-declaration', { done: false, note: 'À ne pas perdre' }));
      await waitFor(() => expect(within(item).queryByRole('textbox')).not.toBeInTheDocument());
    });

    it('keeps the typed note when the server refuses it', async () => {
      api.setLifeEventStep.mockRejectedValue(new ApiError(400, 'note trop longue'));
      const user = renderPage();
      const item = await openNote(user);
      await user.type(within(item).getByRole('textbox'), 'Ma note');
      await user.click(within(item).getByRole('button', { name: 'Enregistrer la note' }));
      expect(await within(item).findByRole('alert')).toHaveTextContent('La note n’a pas pu être enregistrée. Elle reste ici : réessayez.');
      expect(within(item).getByRole('textbox')).toHaveValue('Ma note');
    });
  });

  describe('editing and deleting an event', () => {
    it('opens the form with the current values, saves, and says the deadlines are recalculated', async () => {
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier Naissance d’un enfant' }));
      const dialog = await screen.findByRole('dialog', { name: 'Modifier l’événement' });
      expect(within(dialog).getByLabelText(/Date de naissance/)).toHaveValue('2026-10-31');
      expect(within(dialog).getByLabelText('Libellé')).toHaveValue('Naissance d’un enfant');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2026-11-20' } });
      await user.clear(within(dialog).getByLabelText('Libellé'));
      await user.type(within(dialog).getByLabelText('Libellé'), 'Bébé de novembre');
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      await waitFor(() => expect(api.updateLifeEvent).toHaveBeenCalledWith('e1', { eventDate: '2026-11-20', label: 'Bébé de novembre' }));
      expect(await screen.findByText('Événement modifié : les échéances sont recalculées')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(api.fetchLifeEvents).toHaveBeenCalledTimes(2));
    });

    it('shows the updated card once the server sends the recomputed one', async () => {
      api.fetchLifeEvents.mockResolvedValueOnce([lifeEvent()]).mockResolvedValue([lifeEvent({ label: 'Bébé de novembre', eventDate: '2026-11-20' })]);
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier Naissance d’un enfant' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Date de naissance/), { target: { value: '2026-11-20' } });
      await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
      expect(await screen.findByRole('heading', { name: 'Bébé de novembre' })).toBeInTheDocument();
      expect(screen.getByText('Naissance prévue le 20 novembre 2026')).toBeInTheDocument();
    });

    it('deletes after confirmation, then shows the empty state again', async () => {
      api.fetchLifeEvents.mockResolvedValueOnce([lifeEvent()]).mockResolvedValue([]);
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier Naissance d’un enfant' }));
      await user.click(await screen.findByRole('button', { name: 'Supprimer cet événement' }));
      expect(api.deleteLifeEvent).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
      await waitFor(() => expect(api.deleteLifeEvent).toHaveBeenCalledWith('e1'));
      expect(await screen.findByText('Événement supprimé')).toBeInTheDocument();
      expect(await screen.findByText('À quoi servent les événements de vie ?')).toBeInTheDocument();
    });

    it('keeps the event and explains when the deletion fails', async () => {
      api.deleteLifeEvent.mockRejectedValue(new NetworkError());
      const user = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Modifier Naissance d’un enfant' }));
      await user.click(await screen.findByRole('button', { name: 'Supprimer cet événement' }));
      await user.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('offline and errors', () => {
    it('says it is offline and retries by itself when the network comes back', async () => {
      api.fetchLifeEvents.mockRejectedValueOnce(new NetworkError()).mockResolvedValue([lifeEvent()]);
      renderPage();
      expect(await screen.findByText(/Hors ligne : vos démarches reviendront avec le réseau/)).toBeInTheDocument();
      expect(screen.getByText(/Repères, pas conseils juridiques/)).toBeInTheDocument();
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(await screen.findByTestId('life-event')).toBeInTheDocument();
    });

    it('offers to retry by hand', async () => {
      api.fetchLifeEvents.mockRejectedValueOnce(new NetworkError()).mockResolvedValue([lifeEvent()]);
      const user = renderPage();
      await screen.findByText(/Hors ligne/);
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByTestId('life-event')).toBeInTheDocument();
    });

    it('shows an error, with a retry, when the server fails', async () => {
      api.fetchLifeEvents.mockRejectedValueOnce(new ApiError(500, 'Boom')).mockResolvedValue([lifeEvent()]);
      const user = renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les événements de vie.');
      await user.click(screen.getByRole('button', { name: 'Réessayer' }));
      expect(await screen.findByTestId('life-event')).toBeInTheDocument();
    });

    it('asks to sign in again when the session has expired', async () => {
      api.fetchLifeEvents.mockRejectedValue(new ApiError(401, 'Unauthorized'));
      renderPage();
      expect(await screen.findByRole('alert')).toHaveTextContent('Votre session a expiré');
    });

    it('survives a client without the new methods (older deployment)', async () => {
      api.fetchLifeEvents = undefined as never;
      renderPage();
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      api.fetchLifeEvents = vi.fn();
    });
  });
});
