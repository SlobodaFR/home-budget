import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useHousehold } from '../../application/use-household';
import { ErrorNotice } from '../components/ErrorNotice';
import { LoadingScreen } from '../components/LoadingScreen';

export function RequireHousehold({ children }: { children: ReactNode }) {
  const { household, loading, failed, reload } = useHousehold();

  if (loading) {
    return <LoadingScreen />;
  }
  if (failed) {
    return (
      <div className="mx-auto max-w-[560px] p-margin-mobile">
        <ErrorNotice message="Impossible de charger votre foyer." onRetry={() => void reload()} />
      </div>
    );
  }
  if (!household) {
    return <Navigate to="/bienvenue" replace />;
  }
  return <>{children}</>;
}
