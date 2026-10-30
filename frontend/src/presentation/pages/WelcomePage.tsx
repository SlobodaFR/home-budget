import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { describeError } from '../../application/error-message';
import { useHousehold } from '../../application/use-household';
import { parseAmountToCents } from '../../domain/money';
import { ApiError, apiClient } from '../../infrastructure/api-client';
import { ErrorNotice } from '../components/ErrorNotice';
import { LoadingScreen } from '../components/LoadingScreen';
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../components/ui';

type Mode = 'choice' | 'create' | 'join';

export function WelcomePage() {
  const navigate = useNavigate();
  const { household, loading, failed, reload, setHousehold } = useHousehold();
  const [mode, setMode] = useState<Mode>('choice');
  const [name, setName] = useState('');
  const [income, setIncome] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  if (household) {
    return <Navigate to="/" replace />;
  }

  const finish = (created: Awaited<ReturnType<typeof apiClient.createHousehold>>) => {
    setHousehold(created);
    navigate('/', { replace: true });
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Donnez un nom à votre foyer.');
      return;
    }
    const incomeCents = income.trim() === '' ? undefined : parseAmountToCents(income);
    if (incomeCents === null) {
      setError('Revenu invalide : utilisez des chiffres (ex. 2 300 ou 2300,50).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      finish(await apiClient.createHousehold({ name: trimmed, ...(incomeCents === undefined ? {} : { netMonthlyIncomeCents: incomeCents }) }));
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 409 ? 'Vous avez déjà un foyer.' : describeError(failure, 'Création impossible, réessayez.'));
      setBusy(false);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed === '') {
      setError('Saisissez le code d’invitation.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      finish(await apiClient.joinHousehold(trimmed));
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) {
        setError('Ce code est inconnu, expiré ou déjà utilisé.');
      } else if (failure instanceof ApiError && failure.status === 409) {
        setError('Impossible de rejoindre : vous avez déjà un foyer, ou celui-ci est complet.');
      } else {
        setError(describeError(failure, 'Impossible de rejoindre le foyer, réessayez.'));
      }
      setBusy(false);
    }
  };

  const back = () => {
    setMode('choice');
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-xl px-margin-mobile pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      <div className="text-center">
        <h1 className="font-heading-xl text-heading-xl tracking-tight">Bienvenue</h1>
        <p className="mt-sm font-body-md text-body-md text-mute">
          Commençons par votre foyer : un espace commun pour tous, et un espace perso rien qu’à vous.
        </p>
      </div>

      {mode === 'choice' && (
        <div className="flex flex-col gap-md">
          <button type="button" className={`${buttonPrimary} w-full`} onClick={() => setMode('create')}>
            Créer notre foyer
          </button>
          <button type="button" className={`${buttonSecondary} w-full`} onClick={() => setMode('join')}>
            Rejoindre avec un code d’invitation
          </button>
        </div>
      )}

      {mode === 'create' && (
        <form onSubmit={handleCreate} noValidate className="flex flex-col gap-lg">
          <div>
            <label htmlFor="household-name" className={labelClass}>
              Nom du foyer
            </label>
            <input id="household-name" className={inputClass} value={name} maxLength={60} autoFocus autoComplete="off" onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <label htmlFor="household-income" className={labelClass}>
              Votre revenu net mensuel (facultatif)
            </label>
            <div className="relative">
              <input id="household-income" className={`${inputClass} pr-10`} inputMode="decimal" autoComplete="off" placeholder="2 300" value={income} onChange={(event) => setIncome(event.target.value)} />
              <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-mute">Il sert à calculer la part de chacun dans le commun. Vous pourrez le modifier plus tard.</p>
          </div>
          {error && (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
            {busy ? 'Création…' : 'Créer le foyer'}
          </button>
          <button type="button" onClick={back} className={`${buttonSecondary} w-full`}>
            Retour
          </button>
        </form>
      )}

      {mode === 'join' && (
        <form onSubmit={handleJoin} noValidate className="flex flex-col gap-lg">
          <div>
            <label htmlFor="invitation-code" className={labelClass}>
              Code d’invitation
            </label>
            <input
              id="invitation-code"
              className={`${inputClass} text-center font-mono tracking-widest`}
              value={code}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
            />
            <p className="mt-1 font-body-sm text-body-sm text-mute">Demandez-le à la personne qui a créé le foyer (valable 7 jours, usage unique).</p>
          </div>
          {error && (
            <p role="alert" className="font-body-sm text-body-sm text-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
            {busy ? 'Connexion…' : 'Rejoindre le foyer'}
          </button>
          <button type="button" onClick={back} className={`${buttonSecondary} w-full`}>
            Retour
          </button>
        </form>
      )}
    </main>
  );
}
