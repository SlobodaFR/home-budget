import { chmod, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Exécute `task` dans un dossier temporaire PRIVÉ (mode 0700, nom aléatoire) supprimé
 * dans tous les cas : succès, erreur, délai dépassé ou annulation.
 */
export async function withWorkDir<T>(
  task: (dir: string) => Promise<T>,
  root: string = tmpdir(),
): Promise<T> {
  const dir = await mkdtemp(join(root, 'hb-extract-'));
  try {
    await chmod(dir, 0o700);
    return await task(dir);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 2 });
  }
}
