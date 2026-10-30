import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecurringPayment } from '../../../domain/recurring';
import { RecurringForm } from './RecurringForm';

const NOW = () => new Date(2026, 9, 30, 9, 0, 0);

function setup(props: Partial<Parameters<typeof RecurringForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<RecurringForm editing={null} allowAid={false} aidRules={null} onClose={vi.fn()} onSubmit={onSubmit} now={NOW} {...props} />);
  return { onSubmit, user: userEvent.setup() };
}

const yearly: RecurringPayment = {
  id: 'r9',
  spaceId: 's-common',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: 'Taxe foncière',
  amountCents: 120000,
  dayOfMonth: 15,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  aidRuleId: null,
  frequency: 'YEARLY',
  monthOfYear: 10,
};

describe('RecurringForm periodicity', () => {
  it('is monthly by default, without any month field', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Chaque mois' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Montant par mois')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mois de/)).not.toBeInTheDocument();
  });

  it('offers the three periodicities as 48 px buttons', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Périodicité' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Chaque mois', 'Chaque trimestre', 'Chaque année']);
    expect(within(group).getAllByRole('button').every((button) => button.className.includes('min-h-[48px]'))).toBe(true);
  });

  it('asks for the month of the year and the amount per year, then sends the yearly payload', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Chaque année' }));
    const month = screen.getByLabelText('Mois de l’année');
    expect(month).toHaveValue('10');
    expect(within(month).getAllByRole('option')).toHaveLength(12);
    expect(screen.getByText('Ce paiement tombe chaque année en octobre.')).toBeInTheDocument();
    await user.selectOptions(month, '3');
    expect(screen.getByText('Ce paiement tombe chaque année en mars.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Libellé'), 'Assurance annuelle');
    await user.type(screen.getByLabelText('Montant par an'), '1200');
    expect(screen.getByText(/mettez de côté environ/)).toHaveTextContent(/100,00\s€ par mois/);
    await user.type(screen.getByLabelText(/Jour du mois/), '15');
    await user.click(screen.getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      kind: 'EXPENSE',
      label: 'Assurance annuelle',
      amountCents: 120000,
      dayOfMonth: 15,
      frequency: 'YEARLY',
      monthOfYear: 3,
    });
  });

  it('spells out the four months of a quarterly payment', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Chaque trimestre' }));
    const month = screen.getByLabelText('Mois de départ');
    await user.selectOptions(month, '11');
    expect(screen.getByText('Paiements en novembre, février, mai et août (tous les 3 mois).')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant par trimestre')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Libellé'), 'Eau');
    await user.type(screen.getByLabelText('Montant par trimestre'), '90');
    expect(screen.getByText(/mettez de côté environ/)).toHaveTextContent(/30,00\s€ par mois/);
    await user.click(screen.getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ frequency: 'QUARTERLY', monthOfYear: 11, amountCents: 9000 });
  });

  it('lets an income be non monthly, without any provision advice', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Revenu' }));
    await user.click(screen.getByRole('button', { name: 'Chaque année' }));
    await user.type(screen.getByLabelText('Libellé'), 'Prime annuelle');
    await user.type(screen.getByLabelText('Montant par an'), '2400');
    expect(screen.queryByText(/mettez de côté/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ kind: 'INCOME', frequency: 'YEARLY', monthOfYear: 10 });
  });

  it('sends a null month when the user comes back to monthly', async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole('button', { name: 'Chaque année' }));
    await user.click(screen.getByRole('button', { name: 'Chaque mois' }));
    expect(screen.queryByLabelText('Mois de l’année')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Libellé'), 'Loyer');
    await user.type(screen.getByLabelText('Montant par mois'), '900');
    await user.click(screen.getByRole('button', { name: 'Ajouter le paiement' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ frequency: 'MONTHLY', monthOfYear: null });
  });

  it('starts on the requested periodicity for a new payment', () => {
    setup({ initialFrequency: 'YEARLY' });
    expect(screen.getByRole('button', { name: 'Chaque année' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Mois de l’année')).toBeInTheDocument();
  });

  it('shows an existing yearly payment as such', () => {
    setup({ editing: yearly });
    expect(screen.getByRole('button', { name: 'Chaque année' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Mois de l’année')).toHaveValue('10');
    expect(screen.getByLabelText('Montant par an')).toHaveValue('1200');
  });

  it('opens an old payment without frequency as monthly', () => {
    const { frequency: _f, monthOfYear: _m, ...old } = yearly;
    setup({ editing: old });
    expect(screen.getByRole('button', { name: 'Chaque mois' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Mois de l’année')).not.toBeInTheDocument();
  });
});
