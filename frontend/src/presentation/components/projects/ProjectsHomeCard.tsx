import { Link } from 'react-router-dom';
import { useProjects } from '../../../application/use-projects';
import { describeMonthlyNeed, closestProjects, describeDeadline, Project } from '../../../domain/project';
import { cardClass } from '../ui';
import { KIND_ICON } from './project-style';
import { ProjectProgress } from './ProjectProgress';
import { ProjectStatusBadge } from './ProjectStatusBadge';

function Item({ project }: { project: Project }) {
  const Icon = KIND_ICON[project.kind];
  return (
    <li className="flex flex-col gap-sm py-md" data-testid="home-project">
      <div className="flex items-start gap-md">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft-cloud">
          <Icon width={20} height={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <p className="break-words font-body-md text-body-md font-semibold">{project.name}</p>
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>
      <ProjectProgress project={project} />
      <p className="font-body-sm text-body-sm text-mute">
        {describeDeadline(project)} · {describeMonthlyNeed(project)}
      </p>
    </li>
  );
}

/**
 * « Mes projets » sur l'accueil : les plus proches de l'échéance. C'est un « plus » : tant que la liste charge ou si elle échoue,
 * rien ne s'affiche (comme la carte des conseils).
 */
export function ProjectsHomeCard({ spaceId }: { spaceId: string }) {
  const projects = useProjects(spaceId);
  if (!projects.data) {
    return null;
  }
  const closest = closestProjects(projects.data, 3);
  return (
    <section aria-label="Mes projets" className={cardClass}>
      <div className="flex items-baseline justify-between gap-md">
        <h3 className="font-label-caps text-label-caps uppercase text-mute">Mes projets</h3>
        <Link to="/projets" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
          {projects.data.length === 0 ? 'Créer un projet' : 'Voir mes projets'}
        </Link>
      </div>
      {closest.length === 0 ? (
        <p className="font-body-sm text-body-sm text-mute">
          {projects.data.length === 0
            ? 'Vacances, naissance, voiture… Un projet daté vous dit combien mettre de côté chaque mois.'
            : 'Aucun projet en cours : tous sont atteints ou archivés.'}
        </p>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {closest.map((project) => (
            <Item key={project.id} project={project} />
          ))}
        </ul>
      )}
    </section>
  );
}
