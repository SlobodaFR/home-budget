import { ChangeEvent, useState } from 'react';
import { useDebtExtraction } from '../../../../application/use-debt-extraction';
import { useOnlineStatus } from '../../../../application/use-online-status';
import {
  CONSENT_TEXT,
  CONTRACT_FILE_ACCEPT,
  contractFileError,
  ExtractedField,
  ExtractionCapabilities,
  formatFileSize,
} from '../../../../domain/debt-extraction';
import { CameraIcon, LockIcon, UploadIcon, WifiOffIcon } from '../../Icons';
import { buttonPrimary, buttonSecondary } from '../../ui';
import { ContractProgress } from './ContractProgress';
import { ContractReview } from './ContractReview';

interface Props {
  spaceId: string;
  capabilities: ExtractionCapabilities;
  /** Reçoit les champs cochés ; le résultat est effacé côté serveur avant d'appeler. */
  onApply: (fields: ExtractedField[]) => void;
  /** Retour au formulaire sans rien reprendre. */
  onBack: () => void;
}

const pickerClass =
  'inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-sm rounded-full border border-hairline bg-white px-xl font-button-md text-button-md text-ink transition-colors hover:bg-soft-cloud focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink';

/**
 * Tout le parcours d'import : choix du fichier, consentement, lecture, relecture. Le fichier n'est gardé que le temps du
 * consentement (en mémoire), puis oublié dès l'envoi ; rien n'est écrit sur l'appareil.
 */
export function ContractImport({ spaceId, capabilities, onApply, onBack }: Props) {
  const extraction = useDebtExtraction(spaceId, capabilities.maxFileBytes);
  const online = useOnlineStatus();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const { state } = extraction;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) {
      return;
    }
    const error = contractFileError(chosen, capabilities.maxFileBytes);
    setFileError(error);
    setFile(error ? null : chosen);
  };

  const read = () => {
    if (!file) {
      return;
    }
    const chosen = file;
    setFile(null);
    extraction.start(chosen);
  };

  const apply = (fields: ExtractedField[]) => {
    extraction.release();
    onApply(fields);
  };

  const discard = () => {
    extraction.release();
    onBack();
  };

  if (state.phase === 'uploading' || state.phase === 'running') {
    return <ContractProgress state={state} onCancel={extraction.cancel} />;
  }

  if (state.phase === 'review') {
    return <ContractReview result={state.result} onApply={apply} onCancel={discard} />;
  }

  if (state.phase === 'error') {
    return (
      <div className="flex flex-col gap-lg">
        <p role="alert" className="rounded border border-error/30 bg-error/5 p-md font-body-sm text-body-sm text-error">
          {state.message}
        </p>
        {state.canResume && (
          <button type="button" onClick={extraction.resume} className={`${buttonPrimary} w-full`}>
            Reprendre le suivi
          </button>
        )}
        <button type="button" onClick={extraction.cancel} className={`${state.canResume ? buttonSecondary : buttonPrimary} w-full`}>
          Choisir un autre fichier
        </button>
        <button type="button" onClick={discard} className={`${buttonSecondary} w-full`}>
          Saisir à la main
        </button>
      </div>
    );
  }

  const limits = `PDF, PNG ou JPEG, ${formatFileSize(capabilities.maxFileBytes)} au plus${capabilities.maxPages ? `, ${capabilities.maxPages} pages au plus` : ''}.`;

  if (file) {
    return (
      <div className="flex flex-col gap-lg">
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          <span className="font-semibold">{file.name}</span> ({formatFileSize(file.size)})
        </p>
        <p className="flex items-start gap-sm rounded border border-hairline bg-white p-md font-body-md text-body-md">
          <LockIcon width={20} height={20} className="mt-0.5 shrink-0" />
          {CONSENT_TEXT}
        </p>
        {!online && (
          <p role="status" className="flex items-start gap-sm font-body-sm text-body-sm text-mute">
            <WifiOffIcon width={18} height={18} className="mt-0.5 shrink-0" />
            Vous êtes hors ligne : la lecture reprendra dès que le réseau sera revenu.
          </p>
        )}
        <button type="button" onClick={read} disabled={!online} className={`${buttonPrimary} w-full`}>
          Lire ce contrat
        </button>
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setFileError(null);
          }}
          className={`${buttonSecondary} w-full`}
        >
          Choisir un autre fichier
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <p className="font-body-md text-body-md">
        Choisissez votre contrat ou votre offre de prêt. Les informations lisibles vous seront proposées, et <span className="font-semibold">vous vérifiez tout avant d’enregistrer</span>.
      </p>
      <div className="flex flex-col gap-sm">
        <label className={pickerClass}>
          <UploadIcon width={20} height={20} />
          Choisir un fichier (PDF ou image)
          <input type="file" accept={CONTRACT_FILE_ACCEPT} onChange={handleFile} className="sr-only" aria-label="Fichier du contrat" />
        </label>
        <label className={pickerClass}>
          <CameraIcon width={20} height={20} />
          Prendre une photo
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={handleFile} className="sr-only" aria-label="Photo du contrat" />
        </label>
        <p className="font-body-sm text-body-sm text-mute">{limits}</p>
      </div>
      {fileError && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {fileError}
        </p>
      )}
      <button type="button" onClick={onBack} className={`${buttonSecondary} w-full`}>
        Revenir au formulaire
      </button>
    </div>
  );
}
