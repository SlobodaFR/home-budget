import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from './AuthProvider';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
