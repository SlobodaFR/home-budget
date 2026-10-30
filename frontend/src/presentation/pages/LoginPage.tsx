import { Navigate } from 'react-router-dom';
import { useAuthConfig } from '../../application/use-auth-config';
import { useAuth } from '../auth/AuthProvider';
import { ErrorNotice } from '../components/ErrorNotice';
import { LoadingScreen } from '../components/LoadingScreen';
import { buttonPrimary, buttonSecondary } from '../components/ui';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function LoginPage() {
  const { user, loading: authLoading } = useAuth();
  const { config, loading, failed, retry } = useAuthConfig();

  if (authLoading) {
    return <LoadingScreen />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center gap-xl px-margin-mobile pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="text-center">
        <h1 className="font-heading-xl text-heading-xl tracking-tight">Foyer Budget</h1>
        <p className="mt-sm font-body-md text-body-md text-mute">
          Le budget de la maison, ensemble, avec un espace perso pour chacun.
        </p>
      </div>

      {loading && <LoadingScreen />}
      {failed && <ErrorNotice message="Impossible de joindre le serveur." onRetry={retry} />}

      {config?.mode === 'oauth' && (
        <a href="/api/auth/login" className={`${buttonPrimary} w-full`}>
          Se connecter
        </a>
      )}

      {config?.mode === 'dev' && (
        <section className="flex flex-col gap-md rounded border border-plaisir/40 bg-plaisir/10 p-gutter">
          <p className="font-label-caps text-label-caps uppercase text-plaisir">Mode développement</p>
          <p className="font-body-sm text-body-sm">Choisissez un utilisateur de test pour vous connecter sans mot de passe.</p>
          {config.devUsers.map((name) => (
            <a key={name} href={`/api/auth/dev-login?as=${encodeURIComponent(name)}`} className={`${buttonSecondary} w-full bg-white`}>
              Continuer en tant que {capitalize(name)}
            </a>
          ))}
        </section>
      )}
    </main>
  );
}
