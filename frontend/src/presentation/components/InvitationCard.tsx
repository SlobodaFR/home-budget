import { useState } from 'react';
import { Invitation } from '../../domain/household';
import { formatLongDate } from '../../domain/month';
import { describeError } from '../../application/error-message';
import { apiClient } from '../../infrastructure/api-client';
import { CheckIcon, CopyIcon } from './Icons';
import { buttonPrimary, buttonSecondary } from './ui';

export function InvitationCard({ full }: { full: boolean }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setInvitation(await apiClient.createInvitation());
    } catch (failure) {
      setError(describeError(failure, 'Impossible de créer l’invitation.'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!invitation) {
      return;
    }
    try {
      await navigator.clipboard.writeText(invitation.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copie impossible : sélectionnez le code et copiez-le à la main.');
    }
  };

  if (full) {
    return <p className="font-body-sm text-body-sm text-mute">Le foyer est complet (4 membres au plus).</p>;
  }

  return (
    <div className="flex flex-col gap-md">
      {invitation && (
        <div className="rounded bg-soft-cloud p-gutter text-center">
          <p className="font-label-caps text-label-caps uppercase text-mute">Code d’invitation</p>
          <p data-testid="invitation-code" className="select-all break-all py-sm font-mono text-[28px] font-bold tracking-widest">
            {invitation.code}
          </p>
          <p className="font-body-sm text-body-sm text-mute">
            Valable jusqu’au {formatLongDate(invitation.expiresAt)}, utilisable une seule fois.
          </p>
          <button type="button" onClick={copy} className={`${buttonSecondary} mt-md w-full bg-white`}>
            {copied ? <CheckIcon width={20} height={20} /> : <CopyIcon width={20} height={20} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}
      <button type="button" onClick={create} disabled={busy} className={invitation ? buttonSecondary : buttonPrimary}>
        {busy ? 'Création…' : invitation ? 'Générer un autre code' : 'Inviter quelqu’un'}
      </button>
    </div>
  );
}
