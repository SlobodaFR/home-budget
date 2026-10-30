import { ChangeEvent, useState } from 'react';
import { decodeStatement, StatementEncoding, statementSizeError } from '../../../domain/statement-decoding';
import { ErrorNotice } from '../ErrorNotice';
import { LockIcon, UploadIcon, WifiOffIcon } from '../Icons';
import { buttonPrimary, labelClass } from '../ui';

interface Props {
  text: string;
  online: boolean;
  analyzing: boolean;
  error: string | null;
  onTextChange: (text: string) => void;
  onAnalyze: () => void;
}

interface LoadedFile {
  name: string;
  encoding: StatementEncoding;
}

export function StatementSource({ text, online, analyzing, error, onTextChange, onAnalyze }: Props) {
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setFileError(null);
    const sizeError = statementSizeError(file.size);
    if (sizeError) {
      setFileError(sizeError);
      return;
    }
    try {
      const decoded = decodeStatement(await file.arrayBuffer());
      onTextChange(decoded.text);
      setLoaded({ name: file.name, encoding: decoded.encoding });
    } catch {
      setFileError('Ce fichier n’a pas pu être lu.');
    }
  };

  const handleText = (value: string) => {
    setLoaded(null);
    onTextChange(value);
  };

  const canAnalyze = online && !analyzing && text.trim() !== '';

  return (
    <div className="flex flex-col gap-lg">
      <p className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
        <LockIcon width={20} height={20} className="mt-0.5 shrink-0" />
        Le fichier est lu sur cet appareil et envoyé à votre serveur pour analyse ; seules les lignes que vous validez sont
        enregistrées.
      </p>

      <div>
        <span className={labelClass}>Fichier du relevé (CSV)</span>
        <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-sm rounded-full border border-hairline px-xl font-button-md text-button-md hover:bg-soft-cloud focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <UploadIcon width={20} height={20} />
          Choisir un fichier
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFile} className="sr-only" aria-label="Fichier du relevé" />
        </label>
        {loaded && (
          <p role="status" className="mt-sm font-body-sm text-body-sm text-mute">
            {loaded.name} lu ({loaded.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1252'}). Vérifiez les accents ci-dessous.
          </p>
        )}
        {fileError && (
          <p role="alert" className="mt-sm font-body-sm text-body-sm text-error">
            {fileError}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="statement-text" className={labelClass}>
          Ou collez le contenu du relevé
        </label>
        <textarea
          id="statement-text"
          value={text}
          rows={7}
          spellCheck={false}
          autoComplete="off"
          placeholder={'date;libellé;montant\n02/10/2026;PRLV LOYER;-1100,00'}
          onChange={(event) => handleText(event.target.value)}
          className="min-h-[160px] w-full rounded border border-hairline bg-white p-md font-mono text-[14px] leading-snug text-ink placeholder:text-mute"
        />
      </div>

      {error && <ErrorNotice message={error} />}

      {!online && (
        <p role="status" className="flex items-start gap-sm font-body-sm text-body-sm text-mute">
          <WifiOffIcon width={20} height={20} className="mt-0.5 shrink-0" />
          Hors ligne : l’analyse demande une connexion. Le relevé reste ici en attendant le retour du réseau.
        </p>
      )}

      <button type="button" disabled={!canAnalyze} onClick={onAnalyze} className={`${buttonPrimary} w-full`}>
        {analyzing ? 'Analyse en cours…' : 'Analyser'}
      </button>
    </div>
  );
}
