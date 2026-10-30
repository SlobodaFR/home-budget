import { useCallback, useState } from 'react';
import { ExportRange } from '../domain/export';
import { ApiError, apiClient, DownloadedFile, NetworkError } from '../infrastructure/api-client';
import { saveFile } from '../infrastructure/browser-download';

export type ExportKind = 'backup' | 'csv';

/** Message clair pour chaque cause d'échec d'un export (foyer introuvable, réseau, période refusée, session). */
export function describeExportError(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Pas de connexion : le téléchargement a besoin du réseau. Réessayez dès qu’il est revenu.';
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return 'Aucun foyer n’a été trouvé : créez ou rejoignez un foyer avant de télécharger vos données.';
    }
    if (error.status === 401) {
      return 'Votre session a expiré : reconnectez-vous.';
    }
    if (error.status === 400) {
      return 'Le serveur a refusé cette période (366 jours au plus). Vérifiez les dates et réessayez.';
    }
  }
  return 'Le téléchargement a échoué. Réessayez dans un instant.';
}

export interface ExportActions {
  /** Ce qui est en cours de téléchargement, ou `null`. */
  busy: ExportKind | null;
  /** Télécharge la sauvegarde JSON et renvoie le nom du fichier enregistré. */
  downloadBackup: () => Promise<string>;
  downloadCsv: (spaceId: string, range: ExportRange) => Promise<string>;
}

/** Les deux exports ; les échecs sont relancés tels quels (`describeExportError` les met en mots). */
export function useExport(): ExportActions {
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const run = useCallback(async (kind: ExportKind, fetchFile: () => Promise<DownloadedFile>) => {
    setBusy(kind);
    try {
      const file = await fetchFile();
      saveFile(file);
      return file.filename;
    } finally {
      setBusy(null);
    }
  }, []);

  const downloadBackup = useCallback(() => run('backup', () => apiClient.downloadExport()), [run]);
  const downloadCsv = useCallback(
    (spaceId: string, range: ExportRange) => run('csv', () => apiClient.downloadTransactionsCsv(spaceId, range)),
    [run],
  );

  return { busy, downloadBackup, downloadCsv };
}
