import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecurringPayment } from '../../../domain/recurring';
import { RecurringList } from './RecurringList';

const base: RecurringPayment = {
  id: 'r1',
  spaceId: 's',
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: 'Loyer',
  amountCents: 110000,
  dayOfMonth: 5,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  aidRuleId: null,
};

const renderList = (items: RecurringPayment[]) =>
  render(<RecurringList items={items} aidRules={null} busy={false} onAdd={vi.fn()} onEdit={vi.fn()} onToggle={vi.fn()} onDelete={vi.fn()} />);

describe('RecurringList periodicity', () => {
  it('says « Tous les ans en octobre » and « Tous les 3 mois à partir de novembre »', () => {
    renderList([
      base,
      { ...base, id: 'r2', label: 'Taxe foncière', amountCents: 120000, dayOfMonth: 15, frequency: 'YEARLY', monthOfYear: 10 },
      { ...base, id: 'r3', label: 'Eau', amountCents: 9000, dayOfMonth: null, frequency: 'QUARTERLY', monthOfYear: 11 },
    ]);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Le 5 de chaque mois');
    expect(screen.getByText(/Tous les ans en octobre, le 15/)).toBeInTheDocument();
    expect(screen.getByText(/Tous les 3 mois à partir de novembre, compté en fin de mois/)).toBeInTheDocument();
  });

  it('treats a payment without frequency as monthly', () => {
    renderList([base]);
    expect(screen.getByRole('region', { name: 'Paiements récurrents' })).toHaveTextContent('Le 5 de chaque mois');
    expect(screen.queryByText(/non mensuel/)).not.toBeInTheDocument();
  });

  it('does not count non monthly payments in « Chaque mois » and points to the provisions', () => {
    renderList([
      base,
      { ...base, id: 'r2', label: 'Taxe foncière', amountCents: 120000, frequency: 'YEARLY', monthOfYear: 10 },
      { ...base, id: 'r4', kind: 'INCOME', bloc: null, label: 'Prime', amountCents: 200000, frequency: 'YEARLY', monthOfYear: 12 },
    ]);
    const section = screen.getByRole('region', { name: 'Paiements récurrents' });
    expect(section).toHaveTextContent(/Chaque mois : \+ 0,00 € de revenus, − 1\s100,00 € de dépenses/);
    expect(within(section).getByText(/2 paiements non mensuels/)).toBeInTheDocument();
    expect(within(section).getByText(/onglet Provisions/)).toBeInTheDocument();
  });
});
