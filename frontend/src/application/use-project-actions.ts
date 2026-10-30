import { useCallback, useState } from 'react';
import { Project, ProjectPayload, projectToPayload } from '../domain/project';
import { apiClient } from '../infrastructure/api-client';

/** Création, modification, archivage et suppression des projets ; `onChanged` recharge la liste et le bandeau de synthèse. */
export function useProjectActions(spaceId: string, onChanged: () => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        onChanged();
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const create = useCallback((payload: ProjectPayload) => run(() => apiClient.createProject(spaceId, payload)), [run, spaceId]);
  const update = useCallback(
    (project: Project, payload: ProjectPayload) => run(() => apiClient.updateProject(spaceId, project.id, { ...payload, archived: project.archived })),
    [run, spaceId],
  );
  const setArchived = useCallback(
    (project: Project, archived: boolean) => run(() => apiClient.updateProject(spaceId, project.id, projectToPayload(project, { archived }))),
    [run, spaceId],
  );
  const remove = useCallback((project: Project) => run(() => apiClient.deleteProject(spaceId, project.id)), [run, spaceId]);

  return { busy, create, update, setArchived, remove };
}
