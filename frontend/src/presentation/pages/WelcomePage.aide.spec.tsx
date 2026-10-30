import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdContext, HouseholdContextValue } from '../../application/use-household';
import { WelcomePage } from './WelcomePage';

function renderPage() {
  const value: HouseholdContextValue = { household: null, loading: false, offline: false, failed: false, reload: vi.fn(), setHousehold: vi.fn() };
  render(
    <MemoryRouter initialEntries={['/bienvenue']}>
      <HouseholdContext.Provider value={value}>
        <WelcomePage />
      </HouseholdContext.Provider>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('WelcomePage : aide et documentation', () => {
  it('offers the help to someone who has no household yet', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Aide et documentation' })).toHaveAttribute('href', '/aide');
  });

  it('keeps the link while creating a household and while joining one', async () => {
    const user = renderPage();
    await user.click(screen.getByRole('button', { name: 'Créer notre foyer' }));
    expect(screen.getByRole('link', { name: 'Aide et documentation' })).toHaveAttribute('href', '/aide');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await user.click(screen.getByRole('button', { name: 'Rejoindre avec un code d’invitation' }));
    expect(screen.getByRole('link', { name: 'Aide et documentation' })).toHaveAttribute('href', '/aide');
  });
});
