import { DownloadedFile } from './api-client';

/** Fait enregistrer un fichier par le navigateur (lien temporaire sur un Blob), sans rien envoyer ailleurs. */
export function saveFile({ blob, filename }: DownloadedFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Laisse au navigateur le temps de démarrer le téléchargement avant de libérer le Blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
