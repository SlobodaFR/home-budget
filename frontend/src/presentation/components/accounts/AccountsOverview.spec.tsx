import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { account } from '../../../test/fixtures';
import { AccountsOverview } from './AccountsOverview';

describe('AccountsOverview', () => {
  it('shows nothing without an active account', () => {
    const { container } = render(
      <AccountsOverview accounts={[account({ archived: true })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sums the balances of the active accounts only, and is shown on desktop only', () => {
    render(
      <AccountsOverview
        accounts={[
          account({
            id: 'a1',
            balanceCents: 100000,
            projectedMonthEndCents: 80000,
          }),
          account({
            id: 'a2',
            balanceCents: 50000,
            projectedMonthEndCents: 60000,
          }),
          account({
            id: 'a3',
            archived: true,
            balanceCents: 999999,
            projectedMonthEndCents: 999999,
          }),
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Synthèse des comptes' });
    expect(region.className).toContain('hidden');
    expect(region.className).toContain('lg:grid');
    expect(within(region).getByText('1 500,00 €')).toBeInTheDocument();
    expect(within(region).getByText('1 400,00 €')).toBeInTheDocument();
    expect(within(region).getByText('2 comptes actifs')).toBeInTheDocument();
    expect(
      within(region).getByText('aucun compte sous zéro avant la fin du mois'),
    ).toBeInTheDocument();
  });

  it('points out the accounts that go below zero before the end of the month', () => {
    render(
      <AccountsOverview
        accounts={[
          account({
            id: 'a1',
            balanceCents: 1000,
            projectedMonthEndCents: -2000,
          }),
        ]}
      />,
    );
    const region = screen.getByRole('region', { name: 'Synthèse des comptes' });
    expect(
      within(region).getByText('compte sous zéro avant la fin du mois'),
    ).toBeInTheDocument();
    expect(within(region).getByText('1')).toHaveClass('text-error');
  });
});
