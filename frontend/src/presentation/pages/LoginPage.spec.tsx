import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    logout: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock('../../application/use-auth-config', () => ({
  useAuthConfig: () => ({
    config: { mode: 'oauth', devUsers: [] },
    loading: false,
    failed: false,
    retry: vi.fn<() => void>(),
  }),
}));

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(cleanup);

  it('shows the logged-out state after a service-initiated logout, with a manual login link only', () => {
    renderAt('/login?logged_out=1');
    expect(screen.getByRole('status').textContent).toBe(
      'Vous avez été déconnecté.',
    );
    expect(
      screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href'),
    ).toBe('/api/auth/login');
  });

  it('shows no banner otherwise', () => {
    renderAt('/login');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
