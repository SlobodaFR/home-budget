import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useAccounts } from '../../application/use-accounts';
import { useProjectActions } from '../../application/use-project-actions';
import { useProjects, useProjectsSummary } from '../../application/use-projects';
import { useSpace } from '../../application/use-space';
import { activeProjects, archivedProjects, Project, ProjectPayload } from '../../domain/project';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TargetIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ProjectDetail } from '../components/projects/ProjectDetail';
import { ProjectForm } from '../components/projects/ProjectForm';
import { ProjectsSummaryCard } from '../components/projects/ProjectsSummaryCard';
import { useToast } from '../components/Toast';
import { buttonPrimary, cardClass } from '../components/ui';

type SheetState = { type: 'form'; editing: Project | null } | { type: 'detail'; id: string } | null;

export function ProjetsPage() {
  const { space, kind } = useSpace();
  const toast = useToast();
  const { accounts, nameOf } = useAccounts();
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const projects = useProjects(space.id, version);
  const summary = useProjectsSummary(space.id, version);
  const actions = useProjectActions(space.id, refresh);

  const offline = isOfflineError(projects.error);
  const retry = () => {
    projects.reload();
    summary.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const closeSheet = useCallback(() => setSheet(null), []);
  const list = projects.data ?? [];
  const detailProject = sheet?.type === 'detail' ? (list.find((project) => project.id === sheet.id) ?? null) : null;

  const handleSubmit = async (payload: ProjectPayload) => {
    const editing = sheet?.type === 'form' ? sheet.editing : null;
    try {
      if (editing) {
        await actions.update(editing, payload);
        toast.show('Projet modifié');
      } else {
        await actions.create(payload);
        toast.show('Projet créé');
      }
    } catch (error) {
      throw new Error(describeError(error, 'L’enregistrement a échoué. Vérifiez les informations (l’échéance doit être après la date de départ) et réessayez.'));
    }
    closeSheet();
  };

  const handleToggleArchive = async (project: Project) => {
    try {
      await actions.setArchived(project, !project.archived);
      toast.show(project.archived ? 'Projet désarchivé' : 'Projet archivé : il ne compte plus dans vos besoins');
      closeSheet();
    } catch (error) {
      toast.show(describeError(error, 'Modification impossible.'), 'error');
    }
  };

  const handleDelete = async (project: Project) => {
    try {
      await actions.remove(project);
      toast.show('Projet supprimé');
      closeSheet();
    } catch (error) {
      toast.show(describeError(error, 'Suppression impossible.'), 'error');
    }
  };

  const active = activeProjects(list);
  const archived = archivedProjects(list);
  const renderCard = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      accountLabel={nameOf(project.accountId)}
      onOpen={(target) => setSheet({ type: 'detail', id: target.id })}
      onEdit={(target) => setSheet({ type: 'form', editing: target })}
    />
  );

  return (
    <>
      <div>
        <Link to="/" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Accueil
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Projets {kind === 'COMMON' ? 'communs' : 'perso'}</h2>
        <p className="font-body-sm text-body-sm text-mute">Vacances, naissance, travaux… de l’espace « {space.name} ».</p>
      </div>

      {summary.data && projects.data && <ProjectsSummaryCard summary={summary.data} />}

      {projects.data ? (
        list.length === 0 ? (
          <section aria-label="À quoi servent les projets" className={`${cardClass} flex flex-col gap-md`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft-cloud">
              <TargetIcon width={24} height={24} />
            </span>
            <h3 className="font-heading-lg text-heading-lg">À quoi servent les projets&nbsp;?</h3>
            <p className="font-body-md text-body-md">
              Un projet est un objectif <span className="font-semibold">avec une date</span> : des vacances, une naissance, une voiture. On vous dit
              combien mettre de côté chaque mois pour y arriver, et si vous êtes dans le rythme.
            </p>
            <p className="font-body-sm text-body-sm text-mute">Aucun montant n’est imposé : vous choisissez la somme et la date.</p>
            <button type="button" onClick={() => setSheet({ type: 'form', editing: null })} className={`${buttonPrimary} w-full`}>
              <PlusIcon width={18} height={18} />
              Créer mon premier projet
            </button>
          </section>
        ) : (
          <>
            <button type="button" onClick={() => setSheet({ type: 'form', editing: null })} className={`${buttonPrimary} w-full`}>
              <PlusIcon width={18} height={18} />
              Nouveau projet
            </button>
            {active.length > 0 && <ul aria-label="Projets en cours" className="flex flex-col gap-gutter">{active.map(renderCard)}</ul>}
            {archived.length > 0 && (
              <details className="group rounded bg-white shadow-[0_0_0_1px_#E5E5E5]">
                <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-md px-gutter font-body-md text-body-md font-semibold">
                  <span>Projets archivés ({archived.length})</span>
                  <ChevronRightIcon width={20} height={20} className="transition-transform group-open:rotate-90" />
                </summary>
                <ul aria-label="Projets archivés" className="flex flex-col gap-gutter p-gutter pt-0">
                  {archived.map(renderCard)}
                </ul>
              </details>
            )}
          </>
        )
      ) : offline ? (
        <OfflineNotice message="Hors ligne : vos projets reviendront avec le réseau." onRetry={retry} />
      ) : projects.error ? (
        <ErrorNotice message={describeError(projects.error, 'Impossible de charger les projets.')} onRetry={projects.reload} />
      ) : (
        <LoadingScreen />
      )}

      {sheet?.type === 'form' && (
        <ProjectForm key={sheet.editing?.id ?? 'new'} editing={sheet.editing} accounts={accounts} onClose={closeSheet} onSubmit={handleSubmit} />
      )}
      {detailProject && (
        <ProjectDetail
          key={detailProject.id}
          project={detailProject}
          spaceId={space.id}
          accountLabel={nameOf(detailProject.accountId)}
          busy={actions.busy}
          onClose={closeSheet}
          onEdit={(target) => setSheet({ type: 'form', editing: target })}
          onToggleArchive={handleToggleArchive}
          onDelete={handleDelete}
          onChanged={refresh}
          onNotify={(message, tone) => toast.show(message, tone)}
        />
      )}
    </>
  );
}
