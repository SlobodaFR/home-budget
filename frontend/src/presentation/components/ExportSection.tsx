import { FormEvent, useState } from 'react';
import { describeExportError, useExport } from '../../application/use-export';
import { useRequiredHousehold } from '../../application/use-household';
import { useSpace } from '../../application/use-space';
import { defaultExportRange, ExportRangeErrors, MAX_EXPORT_DAYS, validateExportRange } from '../../domain/export';
import { Space } from '../../domain/household';
import { ErrorNotice } from './ErrorNotice';
import { CheckIcon, DownloadIcon } from './Icons';
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from './ui';

const spaceLabel = (space: Space) => (space.kind === 'COMMON' ? 'Espace commun' : 'Mon espace perso');

function Done({ filename }: { filename: string }) {
  return (
    <p role="status" className="flex items-start gap-sm rounded bg-success/10 p-md font-body-sm text-body-sm font-semibold text-success">
      <CheckIcon width={18} height={18} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">Fichier téléchargé : {filename}</span>
    </p>
  );
}

/** « Mes données » : sauvegarde JSON complète et export CSV des opérations d'un espace sur une période. */
export function ExportSection({ now = () => new Date() }: { now?: () => Date }) {
  const household = useRequiredHousehold();
  const { space } = useSpace();
  const exporter = useExport();

  const [backupDone, setBackupDone] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [spaceId, setSpaceId] = useState(space.id);
  const [range, setRange] = useState(() => defaultExportRange(now()));
  const [rangeErrors, setRangeErrors] = useState<ExportRangeErrors>({});
  const [csvDone, setCsvDone] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const spaces = household.spaces;
  const chosenSpace = spaces.find((item) => item.id === spaceId) ?? space;
  const busy = exporter.busy !== null;

  const handleBackup = async () => {
    setBackupDone(null);
    setBackupError(null);
    try {
      setBackupDone(await exporter.downloadBackup());
    } catch (error) {
      setBackupError(describeExportError(error));
    }
  };

  const handleCsv = async (event: FormEvent) => {
    event.preventDefault();
    setCsvDone(null);
    setCsvError(null);
    const result = validateExportRange(range.from, range.to);
    if (!result.ok) {
      setRangeErrors(result.errors);
      return;
    }
    setRangeErrors({});
    try {
      setCsvDone(await exporter.downloadCsv(chosenSpace.id, result.range));
    } catch (error) {
      setCsvError(describeExportError(error));
    }
  };

  const setDate = (key: 'from' | 'to', value: string) => {
    setRange((previous) => ({ ...previous, [key]: value }));
    setRangeErrors({});
  };

  return (
    <>
      <p className="font-body-sm text-body-sm text-mute">Vos données vous appartiennent : vous pouvez en garder une copie quand vous voulez.</p>

      <div className="flex flex-col gap-md">
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          La sauvegarde contient <span className="font-semibold">uniquement les données auxquelles vous avez accès</span> : le foyer, l’espace commun et votre propre
          espace perso. L’espace perso d’un autre membre n’en fait jamais partie.
        </p>
        <button type="button" onClick={() => void handleBackup()} disabled={busy} className={`${buttonSecondary} w-full`}>
          <DownloadIcon width={18} height={18} />
          {exporter.busy === 'backup' ? 'Téléchargement…' : 'Télécharger une sauvegarde (JSON)'}
        </button>
        {backupDone && <Done filename={backupDone} />}
        {backupError && <ErrorNotice message={backupError} onRetry={() => void handleBackup()} />}
      </div>

      <form onSubmit={(event) => void handleCsv(event)} noValidate aria-label="Exporter les opérations (CSV)" className="flex flex-col gap-md border-t border-hairline-soft pt-md">
        <h4 className="font-body-md text-body-md font-semibold">Exporter les opérations (CSV)</h4>
        <p className="font-body-sm text-body-sm text-mute">
          Un tableau à ouvrir dans Excel ou Numbers : date, type, bloc, libellé, montant et compte de chaque opération. {MAX_EXPORT_DAYS} jours au plus.
        </p>

        {spaces.length > 1 && (
          <div>
            <label htmlFor="export-space" className={labelClass}>
              Espace
            </label>
            <select
              id="export-space"
              value={chosenSpace.id}
              onChange={(event) => {
                setSpaceId(event.target.value);
                setCsvDone(null);
              }}
              className={inputClass}
            >
              {spaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {spaceLabel(item)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-md">
          <div className="min-w-0">
            <label htmlFor="export-from" className={labelClass}>
              Du
            </label>
            <input
              id="export-from"
              type="date"
              value={range.from}
              aria-invalid={rangeErrors.from || rangeErrors.range ? true : undefined}
              aria-describedby={rangeErrors.from ? 'export-from-error' : rangeErrors.range ? 'export-range-error' : undefined}
              onChange={(event) => setDate('from', event.target.value)}
              className={inputClass}
            />
            {rangeErrors.from && (
              <p id="export-from-error" role="alert" className="mt-1 font-body-sm text-body-sm text-error">
                {rangeErrors.from}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <label htmlFor="export-to" className={labelClass}>
              Au
            </label>
            <input
              id="export-to"
              type="date"
              value={range.to}
              aria-invalid={rangeErrors.to || rangeErrors.range ? true : undefined}
              aria-describedby={rangeErrors.to ? 'export-to-error' : rangeErrors.range ? 'export-range-error' : undefined}
              onChange={(event) => setDate('to', event.target.value)}
              className={inputClass}
            />
            {rangeErrors.to && (
              <p id="export-to-error" role="alert" className="mt-1 font-body-sm text-body-sm text-error">
                {rangeErrors.to}
              </p>
            )}
          </div>
        </div>
        {rangeErrors.range && (
          <p id="export-range-error" role="alert" className="font-body-sm text-body-sm font-semibold text-error">
            {rangeErrors.range}
          </p>
        )}

        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          <DownloadIcon width={18} height={18} />
          {exporter.busy === 'csv' ? 'Téléchargement…' : 'Télécharger le CSV'}
        </button>
        {csvDone && <Done filename={csvDone} />}
        {csvError && <ErrorNotice message={csvError} />}
      </form>
    </>
  );
}
