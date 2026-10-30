import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickEntrySheet } from './QuickEntrySheet';

const NOW = new Date(2026, 9, 20, 12, 0, 0);

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(<QuickEntrySheet defaultBloc="COURANT" onClose={onClose} onSubmit={onSubmit} now={() => NOW} />);
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe('QuickEntrySheet', () => {
  it('refuses an empty amount without sending anything', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez un montant');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a malformed amount', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Montant'), '12,345');
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Montant invalide');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the expense with the French decimal comma and the chosen bloc', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Montant'), '12,50');
    await user.click(screen.getByRole('button', { name: 'Plaisir' }));
    await user.type(screen.getByLabelText(/Libellé/), 'Cinéma');
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'EXPENSE',
      bloc: 'PLAISIR',
      label: 'Cinéma',
      amountCents: 1250,
      date: expect.stringMatching(/^2026-10-20T/),
    });
  });

  it('uses the bloc name when the label is left empty', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Montant'), '30');
    await user.click(screen.getByRole('button', { name: 'Fixe' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ label: 'Fixe', bloc: 'FIXE', amountCents: 3000 }));
  });

  it('sends an income without bloc and hides the bloc chips', async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Revenu' }));
    expect(screen.queryByRole('group', { name: 'Bloc' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Montant'), '2000');
    await user.click(screen.getByRole('button', { name: 'Ajouter le revenu' }));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ kind: 'INCOME', label: 'Revenu', amountCents: 200000 });
    expect(payload).not.toHaveProperty('bloc');
  });

  it('uses an edited date', async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText('Montant'), '5');
    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-10-03');
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-10-03T00:00:00.000Z' }));
  });

  it('does not send twice when the button is tapped repeatedly', async () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    const { user } = setup(onSubmit);
    await user.type(screen.getByLabelText('Montant'), '8');
    const button = screen.getByRole('button', { name: 'Ajouter la dépense' });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Enregistrement…' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the error returned by the submission and allows another try', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Pas de connexion')).mockResolvedValueOnce(undefined);
    const { user } = setup(onSubmit);
    await user.type(screen.getByLabelText('Montant'), '8');
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(await screen.findByText('Pas de connexion')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('prefills the form when editing', () => {
    render(
      <QuickEntrySheet
        defaultBloc="COURANT"
        editing={{ id: 't1', spaceId: 's1', kind: 'EXPENSE', bloc: 'EPARGNE', label: 'Livret', amountCents: 5050, date: '2026-10-05T08:00:00.000Z' }}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Montant')).toHaveValue('50,50');
    expect(screen.getByLabelText(/Libellé/)).toHaveValue('Livret');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-05');
    expect(screen.getByRole('button', { name: 'Épargne' })).toHaveAttribute('aria-pressed', 'true');
  });
});
