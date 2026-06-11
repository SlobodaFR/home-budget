import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="w-full top-0 sticky bg-surface border-b border-hairline-soft flex justify-between items-center px-margin-mobile py-md md:px-margin-desktop max-w-full z-40">
      <div className="flex items-center gap-xl">
        <Link
          to="/"
          className="font-display-campaign text-display-campaign-mobile uppercase tracking-tighter text-ink"
        >
          EQUITY
        </Link>
        {user && (
          <Link to="/forecast" className="font-label-caps text-label-caps text-mute uppercase">
            Previsionnel
          </Link>
        )}
      </div>
      {user && (
        <div className="flex items-center gap-md">
          <span className="font-body-sm text-body-sm text-mute">{user.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="font-label-caps text-label-caps text-mute border-b border-mute uppercase"
          >
            Deconnexion
          </button>
        </div>
      )}
    </header>
  );
}
