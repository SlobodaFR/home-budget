import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { lifeEvent } from '../../../test/fixtures';
import { LifeEventForm } from './LifeEventForm';

const NOW = new Date(2026, 9, 30, 12, 0, 0);

type Props = Parameters<typeof LifeEventForm>[0];

function renderForm(overrides: Partial<Props> = {}) {
  const props: Props = { editing: null, onClose: vi.fn(), onSubmit: vi.fn().mockResolvedValue(undefined), now: () => NOW, ...overrides };
  render(<LifeEventForm {...props} />);
  return { props, user: userEvent.setup() };
}

const setDate = async (user: ReturnType<typeof userEvent.setup>, value: string) => {
  const input = screen.getByLabelText(/Date de naissance/);
  await user.clear(input);
  await user.type(input, value);
};

describe('LifeEventForm (new birth)', () => {
  it('asks for the date, with a hint, and an optional label', () => {
    renderForm();
    expect(screen.getByRole('dialog', { name: 'Ajouter une naissance' })).toBeInTheDocument();
    const date = screen.getByLabelText('Date de naissance (prévue ou réelle)');
    expect(date).toHaveValue('');
    expect(date).toHaveAttribute('min', '2024-10-30');
    expect(date).toHaveAttribute('max', '2028-04-30');
    expect(screen.getByLabelText('Libellé (facultatif)')).toHaveAttribute('placeholder', 'Naissance d’un enfant');
    expect(screen.getByText(/60 caractères au plus/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it('refuses a missing date without calling the server', async () => {
    const { props, user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Indiquez la date de naissance (prévue ou réelle).');
    expect(screen.getByLabelText(/Date de naissance/)).toHaveAttribute('aria-invalid', 'true');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a date outside the window, naming the window', async () => {
    const { props, user } = renderForm();
    await setDate(user, '2029-01-01');
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('entre le 30 octobre 2024 et le 30 avril 2028');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a label over 60 characters, keeping what was typed', async () => {
    const { props, user } = renderForm();
    await setDate(user, '2026-11-12');
    await user.click(screen.getByLabelText('Libellé (facultatif)'));
    await user.paste('b'.repeat(61));
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le libellé est trop long (60 caractères au plus).');
    expect(screen.getByLabelText('Libellé (facultatif)')).toHaveValue('b'.repeat(61));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the date alone when the label is left empty', async () => {
    const { props, user } = renderForm();
    await setDate(user, '2026-11-12');
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith({ eventDate: '2026-11-12' }));
  });

  it('submits the date and the trimmed label', async () => {
    const { props, user } = renderForm();
    await setDate(user, '2026-11-12');
    await user.type(screen.getByLabelText('Libellé (facultatif)'), '  Bébé de novembre ');
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith({ eventDate: '2026-11-12', label: 'Bébé de novembre' }));
  });

  it('shows the error of the server and lets you try again', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Pas de connexion : réessayez dès que le réseau est revenu.')).mockResolvedValue(undefined);
    const { user } = renderForm({ onSubmit });
    await setDate(user, '2026-11-12');
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(screen.getByLabelText(/Date de naissance/)).toHaveValue('2026-11-12');
    await user.click(screen.getByRole('button', { name: 'Afficher mes démarches' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it('closes with Escape and with the close button', async () => {
    const { props, user } = renderForm();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('LifeEventForm (editing)', () => {
  const editing = lifeEvent({ label: 'Bébé de novembre', eventDate: '2026-11-12' });

  it('starts from the current date and label, and says that deadlines are recalculated', () => {
    renderForm({ editing, onDelete: vi.fn() });
    expect(screen.getByRole('dialog', { name: 'Modifier l’événement' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Date de naissance/)).toHaveValue('2026-11-12');
    expect(screen.getByLabelText('Libellé')).toHaveValue('Bébé de novembre');
    expect(screen.getByText(/les échéances sont alors recalculées et les démarches déjà faites restent faites/)).toBeInTheDocument();
  });

  it('requires a label (the server refuses an empty one)', async () => {
    const { props, user } = renderForm({ editing });
    await user.clear(screen.getByLabelText('Libellé'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Donnez un libellé');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('submits the new date and label', async () => {
    const { props, user } = renderForm({ editing });
    await setDate(user, '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith({ eventDate: '2026-11-20', label: 'Bébé de novembre' }));
  });

  it('asks for confirmation before deleting, and lets you keep the event', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { user } = renderForm({ editing, onDelete });
    await user.click(screen.getByRole('button', { name: 'Supprimer cet événement' }));
    expect(screen.getByText('Supprimer cet événement et le suivi de ses démarches ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Non, la garder' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Supprimer cet événement' })).toBeInTheDocument();
  });

  it('deletes once confirmed', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { user } = renderForm({ editing, onDelete });
    await user.click(screen.getByRole('button', { name: 'Supprimer cet événement' }));
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(editing));
  });

  it('explains a failed deletion and goes back to the first question', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Suppression impossible. Réessayez.'));
    const { user } = renderForm({ editing, onDelete });
    await user.click(screen.getByRole('button', { name: 'Supprimer cet événement' }));
    await user.click(screen.getByRole('button', { name: 'Oui, supprimer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Suppression impossible. Réessayez.');
    expect(screen.getByRole('button', { name: 'Supprimer cet événement' })).toBeInTheDocument();
  });
});
