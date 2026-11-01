import { describeExtractionStage } from '../../../../domain/debt-extraction';
import { ImportState } from '../../../../application/use-debt-extraction';
import { WifiOffIcon } from '../../Icons';
import { buttonSecondary } from '../../ui';

type Working = Extract<ImportState, { phase: 'uploading' | 'running' }>;

/** La lecture en cours : barre de progression accessible, étape, et un bouton pour annuler. */
export function ContractProgress({ state, onCancel }: { state: Working; onCancel: () => void }) {
  const uploading = state.phase === 'uploading';
  const label = uploading ? 'Envoi du contrat' : describeExtractionStage(state);
  const percent = uploading ? null : state.progressPercent;
  return (
    <section aria-label="Lecture du contrat en cours" className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <p role="status" className="font-body-md text-body-md font-semibold">
          {label}
          {uploading ? '…' : percent !== null ? ` (${percent} %)` : ''}
        </p>
        <div
          role="progressbar"
          aria-label="Avancement de la lecture du contrat"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={percent === null ? `${label}…` : `${label}, ${percent} %`}
          className="h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
        >
          <div className={`h-full rounded-full bg-ink transition-[width] duration-300 ${percent === null ? 'w-1/3 motion-safe:animate-pulse' : ''}`} style={percent === null ? undefined : { width: `${Math.max(percent, 3)}%` }} />
        </div>
        {state.phase === 'running' && state.connectionLost && (
          <p role="status" className="flex items-start gap-sm font-body-sm text-body-sm text-mute">
            <WifiOffIcon width={18} height={18} className="mt-0.5 shrink-0" />
            Connexion perdue : nouvel essai en cours…
          </p>
        )}
      </div>
      <p className="font-body-sm text-body-sm text-mute">Cela peut prendre une minute, surtout pour un scan ou une photo. Le contrat est supprimé du serveur dès que la lecture est terminée.</p>
      <button type="button" onClick={onCancel} className={`${buttonSecondary} w-full`}>
        Annuler
      </button>
    </section>
  );
}
