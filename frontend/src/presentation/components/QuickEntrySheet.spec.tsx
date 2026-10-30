import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { account } from '../../test/fixtures';
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

  describe('bank account', () => {
    const accounts = [
      account({ id: 'a1', name: 'Compte commun' }),
      account({ id: 'a2', name: 'Livret A', kind: 'SAVINGS' }),
      account({ id: 'a3', name: 'Ancien compte', archived: true }),
    ];
    const setupWithAccounts = (props: Partial<React.ComponentProps<typeof QuickEntrySheet>> = {}) => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<QuickEntrySheet defaultBloc="COURANT" accounts={accounts} onClose={vi.fn()} onSubmit={onSubmit} now={() => NOW} {...props} />);
      return { onSubmit, user: userEvent.setup() };
    };

    it('shows no selector when the space has no account, or only archived ones', () => {
      setup();
      expect(screen.queryByLabelText(/Compte/)).not.toBeInTheDocument();
      render(<QuickEntrySheet defaultBloc="COURANT" accounts={[accounts[2]]} onClose={vi.fn()} onSubmit={vi.fn()} />);
      expect(screen.queryByLabelText(/Compte \(facultatif\)/)).not.toBeInTheDocument();
    });

    it('offers « Aucun » first, then the non archived accounts, with none selected by default', () => {
      setupWithAccounts();
      const select = screen.getByLabelText('Compte (facultatif)') as HTMLSelectElement;
      expect(select).toHaveValue('');
      expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Aucun', 'Compte commun', 'Livret A']);
    });

    it('preselects the remembered account', () => {
      setupWithAccounts({ defaultAccountId: 'a2' });
      expect(screen.getByLabelText('Compte (facultatif)')).toHaveValue('a2');
    });

    it('sends the chosen account with the operation', async () => {
      const { onSubmit, user } = setupWithAccounts();
      await user.type(screen.getByLabelText('Montant'), '12,50');
      await user.selectOptions(screen.getByLabelText('Compte (facultatif)'), 'a1');
      await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1250, accountId: 'a1' }));
    });

    it('sends an explicit null when « Aucun » is kept', async () => {
      const { onSubmit, user } = setupWithAccounts();
      await user.type(screen.getByLabelText('Montant'), '5');
      await user.click(screen.getByRole('button', { name: 'Ajouter la dépense' }));
      expect(onSubmit.mock.calls[0][0].accountId).toBeNull();
    });

    const edited = { id: 't1', spaceId: 's1', kind: 'EXPENSE' as const, bloc: 'COURANT' as const, label: 'Courses', amountCents: 4200, date: '2026-10-05T08:00:00.000Z', accountId: 'a2' };

    it('keeps the account of an edited operation', async () => {
      const { onSubmit, user } = setupWithAccounts({ editing: edited });
      expect(screen.getByLabelText('Compte (facultatif)')).toHaveValue('a2');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(onSubmit.mock.calls[0][0].accountId).toBe('a2');
    });

    it('can detach an edited operation from its account', async () => {
      const { onSubmit, user } = setupWithAccounts({ editing: edited });
      await user.selectOptions(screen.getByLabelText('Compte (facultatif)'), '');
      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(onSubmit.mock.calls[0][0].accountId).toBeNull();
    });

    it('still lists the archived account of an edited operation, labelled', () => {
      const editing = { id: 't1', spaceId: 's1', kind: 'EXPENSE' as const, bloc: 'COURANT' as const, label: 'Courses', amountCents: 4200, date: '2026-10-05T08:00:00.000Z', accountId: 'a3' };
      setupWithAccounts({ editing });
      const select = screen.getByLabelText('Compte (facultatif)') as HTMLSelectElement;
      expect(select).toHaveValue('a3');
      expect(Array.from(select.options).map((option) => option.textContent)).toContain('Ancien compte (archivé)');
    });

    it('does not detach an edited operation from its account when the accounts could not be loaded', async () => {
      const editing = { id: 't1', spaceId: 's1', kind: 'EXPENSE' as const, bloc: 'COURANT' as const, label: 'Courses', amountCents: 4200, date: '2026-10-05T08:00:00.000Z', accountId: 'a2' };
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      render(<QuickEntrySheet defaultBloc="COURANT" editing={editing} onClose={vi.fn()} onSubmit={onSubmit} />);
      expect(screen.queryByLabelText(/Compte/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      expect(onSubmit.mock.calls[0][0].accountId).toBe('a2');
    });
  });
});
