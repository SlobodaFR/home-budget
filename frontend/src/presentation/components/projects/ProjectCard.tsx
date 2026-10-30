import {
  behindCents,
  describeDeadline,
  describeMonthlyNeed,
  PROJECT_KIND_LABEL,
  Project,
} from '../../../domain/project';
import { formatCentsShort } from '../../../domain/money';
import { PencilIcon } from '../Icons';
import { cardClass } from '../ui';
import { KIND_ICON } from './project-style';
import { ProjectProgress } from './ProjectProgress';
import { ProjectStatusBadge } from './ProjectStatusBadge';

interface Props {
  project: Project;
  /** Nom du compte rattaché, s'il y en a un. */
  accountLabel?: string | null;
  onOpen: (project: Project) => void;
  onEdit: (project: Project) => void;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud';

export function ProjectCard({ project, accountLabel = null, onOpen, onEdit }: Props) {
  const Icon = KIND_ICON[project.kind];
  const behind = behindCents(project);
  return (
    <li className={`${cardClass} flex flex-col gap-md ${project.archived ? 'opacity-80' : ''}`} data-testid="project-card" data-status={project.status}>
      <div className="flex items-start gap-md">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud">
          <Icon width={22} height={22} />
          <span className="sr-only">{PROJECT_KIND_LABEL[project.kind]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="break-words font-body-md text-body-md font-semibold">{project.name}</h4>
          <p className="font-body-sm text-body-sm text-mute">
            {PROJECT_KIND_LABEL[project.kind]}
            {accountLabel ? ` · ${accountLabel}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        <ProjectStatusBadge status={project.status} />
        {project.archived && (
          <span className="rounded-full bg-soft-cloud px-md py-0.5 font-body-sm text-body-sm font-semibold text-mute">Archivé</span>
        )}
      </div>

      <ProjectProgress project={project} />

      <div className="font-body-sm text-body-sm">
        <p className="text-mute">{describeDeadline(project)}</p>
        {!project.archived && <p className="font-semibold">{describeMonthlyNeed(project)}</p>}
        {!project.archived && behind > 0 && (
          <p className="text-mute">Il manque {formatCentsShort(behind)} par rapport au rythme prévu.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-sm">
        <button type="button" onClick={() => onOpen(project)} aria-label={`Versements de ${project.name}`} className={`${actionButton} bg-ink text-surface hover:bg-ink`}>
          Versements
        </button>
        <button type="button" onClick={() => onEdit(project)} aria-label={`Modifier ${project.name}`} className={actionButton}>
          <PencilIcon width={18} height={18} />
          Modifier
        </button>
      </div>
    </li>
  );
}
