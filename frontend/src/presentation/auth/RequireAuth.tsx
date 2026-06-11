import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="px-margin-mobile py-section text-center text-mute">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
