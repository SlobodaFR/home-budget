import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { lifeEventStep } from '../../../test/fixtures';
import { StepItem } from './StepItem';

type Props = Parameters<typeof StepItem>[0];

function renderStep(overrides: Partial<Props> = {}) {
  const props: Props = { step: lifeEventStep(), saving: false, onToggle: vi.fn(), onSaveNote: vi.fn().mockResolvedValue(undefined), ...overrides };
  render(
    <MemoryRouter>
      <ul>
        <StepItem {...props} />
      </ul>
    </MemoryRouter>,
  );
  return { props, user: userEvent.setup() };
}

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

describe('StepItem', () => {
  it('shows the title, the category with an icon AND its name, and the due date with its label', () => {
    renderStep();
    const item = screen.getByTestId('life-step');
    expect(within(item).getByText('Déclarer la naissance à la mairie')).toBeInTheDocument();
    expect(within(item).getByText('Administratif')).toBeInTheDocument();
    expect(plain(item.textContent)).toContain('Échéance le 5 nov. 2026 · Dans les 5 jours après la naissance');
    expect(within(item).getByText(/À faire dans les 5 jours/)).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', 'Administratif'],
    ['AIDES', 'Aides'],
    ['SANTE', 'Santé'],
    ['TRAVAIL', 'Travail'],
    ['BUDGET', 'Budget'],
  ] as const)('names the %s category in words', (category, label) => {
    renderStep({ step: lifeEventStep({ category }) });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('has a checkbox named after the step, 44 px wide and high, described by its category and due date', () => {
    renderStep();
    const checkbox = screen.getByRole('checkbox', { name: 'Déclarer la naissance à la mairie' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox.className).toContain('h-full');
    expect(checkbox.parentElement?.className).toContain('h-11');
    expect(checkbox.parentElement?.className).toContain('w-11');
    expect(checkbox).toHaveAccessibleDescription(/Administratif.*Échéance le 5 nov\. 2026/);
  });

  it('asks to tick, and to untick a done step, which shows when it was done instead of a due date', async () => {
    const first = renderStep();
    await first.user.click(screen.getByRole('checkbox'));
    expect(first.props.onToggle).toHaveBeenCalledWith(true);
  });

  it('shows a done step checked, with its completion date and no due date', async () => {
    const { props, user } = renderStep({ step: lifeEventStep({ status: 'DONE', doneAt: '2026-10-28T09:00:00.000Z' }) });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
    expect(screen.getByText('Faite le 28 oct. 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Échéance le/)).not.toBeInTheDocument();
    await user.click(checkbox);
    expect(props.onToggle).toHaveBeenCalledWith(false);
  });

  it('can also be ticked by clicking its title', async () => {
    const { props, user } = renderStep();
    await user.click(screen.getByText('Déclarer la naissance à la mairie'));
    expect(props.onToggle).toHaveBeenCalledWith(true);
  });

  it('ignores clicks while saving, and says so to assistive technology', async () => {
    const { props, user } = renderStep({ saving: true });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-busy', 'true');
    await user.click(checkbox);
    expect(props.onToggle).not.toHaveBeenCalled();
  });

  it('colours an overdue step by its status (text is always there too)', () => {
    renderStep({ step: lifeEventStep({ status: 'OVERDUE', dueDate: '2026-10-15' }) });
    expect(screen.getByTestId('life-step')).toHaveAttribute('data-status', 'OVERDUE');
    expect(screen.getByText(/Échéance le 15 oct\. 2026/).className).toContain('text-error');
  });

  it('shows the label alone for a step without a fixed date', () => {
    renderStep({ step: lifeEventStep({ status: 'NO_DATE', dueDate: null, dueLabel: 'Dès la naissance' }) });
    expect(screen.getByText('Dès la naissance')).toBeInTheDocument();
    expect(screen.queryByText(/Échéance le/)).not.toBeInTheDocument();
  });

  describe('details', () => {
    it('keeps the source, the note editor and the useful link hidden until asked', async () => {
      const { user } = renderStep({ step: lifeEventStep({ link: '/aides', verifiedOn: '2026-10-30' }) });
      expect(screen.queryByText(/Source :/)).not.toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: /Voir le détail, la source et ma note/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      expect(screen.getByRole('button', { name: /Masquer le détail/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/Source :/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ajouter une note' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voir les aides' })).toHaveAttribute('href', '/aides');
    });

    it('links to the official source in a new tab, safely, with the verification date', async () => {
      const { user } = renderStep({ step: lifeEventStep({ verifiedOn: '2026-10-30' }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      const link = screen.getByRole('link', { name: /service-public\.gouv\.fr/ });
      expect(link).toHaveAttribute('href', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F961');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAccessibleName(/nouvel onglet/);
      expect(plain(link.closest('p')?.textContent)).toContain('Source : service-public.gouv.fr (s’ouvre dans un nouvel onglet) (vérifié le 30 octobre 2026)');
    });

    it('omits the verification date when it is not known', async () => {
      const { user } = renderStep({ step: lifeEventStep({ verifiedOn: null }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      expect(screen.queryByText(/vérifié le/)).not.toBeInTheDocument();
    });

    it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://exemple.test/fichier', 'pas une adresse', ''])('never makes a link of %j, and keeps the name of the source', async (sourceUrl) => {
      const { user } = renderStep({ step: lifeEventStep({ sourceUrl, sourceLabel: 'ameli.fr' }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      expect(screen.queryByRole('link', { name: /ameli\.fr/ })).not.toBeInTheDocument();
      expect(screen.getByText('ameli.fr')).toBeInTheDocument();
    });

    it('accepts a plain http source too', async () => {
      const { user } = renderStep({ step: lifeEventStep({ sourceUrl: 'http://exemple.test/page' }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      expect(screen.getByRole('link', { name: /service-public/ })).toHaveAttribute('href', 'http://exemple.test/page');
    });

    it.each(['/dettes', '/tendances', '/inconnue', 'https://exemple.test', ''])('offers no button for the unknown route %j', async (link) => {
      const { user } = renderStep({ step: lifeEventStep({ link }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      expect(screen.queryByRole('link', { name: /Voir|Ouvrir/ })).not.toBeInTheDocument();
    });

    it.each([
      ['/aides', 'Voir les aides'],
      ['/plan', 'Ouvrir le plan'],
      ['/previsionnel', 'Voir le prévisionnel'],
      ['/projets', 'Voir mes projets'],
      ['/comptes', 'Voir mes comptes'],
    ])('offers a button to %s', async (link, label) => {
      const { user } = renderStep({ step: lifeEventStep({ link }) });
      await user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', link);
    });

    it('shows the saved note even when folded', () => {
      renderStep({ step: lifeEventStep({ note: 'RDV lundi à 9 h' }) });
      expect(screen.getByText('RDV lundi à 9 h')).toBeInTheDocument();
    });
  });

  describe('note', () => {
    const openNote = async (overrides: Partial<Props> = {}) => {
      const rendered = renderStep(overrides);
      await rendered.user.click(screen.getByRole('button', { name: /Voir le détail/ }));
      await rendered.user.click(screen.getByRole('button', { name: /Ajouter une note|Modifier la note/ }));
      return rendered;
    };

    it('warns not to write anything sensitive and counts the characters', async () => {
      const { user } = await openNote();
      expect(screen.getByText(/Ne notez rien de sensible/)).toBeInTheDocument();
      expect(screen.getByText('0 / 200 caractères')).toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: 'Ma note (facultatif)' }), 'RDV lundi');
      expect(screen.getByText('9 / 200 caractères')).toBeInTheDocument();
    });

    it('saves the trimmed note and closes the editor', async () => {
      const { props, user } = await openNote();
      await user.type(screen.getByRole('textbox'), '  RDV lundi  ');
      await user.click(screen.getByRole('button', { name: 'Enregistrer la note' }));
      expect(props.onSaveNote).toHaveBeenCalledWith('RDV lundi');
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('starts from the existing note when editing', async () => {
      await openNote({ step: lifeEventStep({ note: 'Déjà là' }) });
      expect(screen.getByRole('textbox')).toHaveValue('Déjà là');
    });

    it('keeps the typed note, and says why, when saving fails', async () => {
      const { user } = await openNote({ onSaveNote: vi.fn().mockRejectedValue(new Error('Pas de connexion : votre note reste ici.')) });
      await user.type(screen.getByRole('textbox'), 'Ma saisie importante');
      await user.click(screen.getByRole('button', { name: 'Enregistrer la note' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion : votre note reste ici.');
      expect(screen.getByRole('textbox')).toHaveValue('Ma saisie importante');
      expect(screen.getByRole('button', { name: 'Enregistrer la note' })).toBeEnabled();
    });

    it('does not send a note over 200 characters, and tells how far over it is', async () => {
      const { props, user } = await openNote();
      await user.click(screen.getByRole('textbox'));
      await user.paste('a'.repeat(201));
      expect(screen.getByRole('textbox')).toHaveValue('a'.repeat(201));
      expect(screen.getByText('201 / 200 caractères').className).toContain('text-error');
      expect(screen.getByRole('button', { name: 'Enregistrer la note' })).toBeDisabled();
      expect(props.onSaveNote).not.toHaveBeenCalled();
    });

    it('accepts exactly 200 characters', async () => {
      const { props, user } = await openNote();
      await user.click(screen.getByRole('textbox'));
      await user.paste('a'.repeat(200));
      await user.click(screen.getByRole('button', { name: 'Enregistrer la note' }));
      expect(props.onSaveNote).toHaveBeenCalledWith('a'.repeat(200));
    });

    it('cancels without saving', async () => {
      const { props, user } = await openNote();
      await user.type(screen.getByRole('textbox'), 'abandon');
      await user.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(props.onSaveNote).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Ajouter une note' })).toBeInTheDocument();
    });
  });
});
