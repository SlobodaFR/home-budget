import { useOfflineQueue } from '../../application/use-offline-queue';
import { useOnlineStatus } from '../../application/use-online-status';
import { formatCents } from '../../domain/money';
import { ClockIcon, WifiOffIcon } from '../components/Icons';

export function SyncBanner() {
  const online = useOnlineStatus();
  const { pending, rejected, dismissRejected } = useOfflineQueue();

  return (
    <>
      {(!online || pending.length > 0) && (
        <div role="status" className="flex items-center justify-between gap-md rounded bg-ink px-gutter py-sm text-surface">
          <span className="flex items-center gap-sm font-body-sm text-body-sm">
            {online ? <ClockIcon width={18} height={18} /> : <WifiOffIcon width={18} height={18} />}
            {online ? 'Envoi en cours…' : 'Hors ligne : vos saisies sont gardées sur cet appareil.'}
          </span>
          {pending.length > 0 && (
            <span className="shrink-0 rounded-full bg-surface px-md py-0.5 font-body-sm text-[12px] font-bold text-ink">
              {pending.length} en attente
            </span>
          )}
        </div>
      )}
      {rejected.length > 0 && (
        <div role="alert" className="flex items-start justify-between gap-md rounded border border-error/30 bg-error/5 p-md">
          <p className="font-body-sm text-body-sm text-error">
            {rejected.length === 1 ? 'Une opération a été refusée' : `${rejected.length} opérations ont été refusées`} par le
            serveur et n’a pas pu être envoyée :{' '}
            {rejected.map((item) => `« ${item.payload.label} » (${formatCents(item.payload.amountCents)})`).join(', ')}. Saisissez-la à nouveau.
          </p>
          <button type="button" onClick={dismissRejected} className="min-h-[44px] shrink-0 px-sm font-body-sm text-body-sm font-semibold underline">
            Compris
          </button>
        </div>
      )}
    </>
  );
}
