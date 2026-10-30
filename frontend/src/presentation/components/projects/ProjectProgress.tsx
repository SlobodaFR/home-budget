import { describeProgress, expectedPercent, Project } from '../../../domain/project';
import { STATUS_STYLE } from './project-style';

interface Props {
  project: Pick<Project, 'progressPercent' | 'savedCents' | 'targetCents' | 'status' | 'expectedSavedCents'>;
  /** Marque sur la barre l'avancement attendu aujourd'hui. */
  showExpected?: boolean;
}

/**
 * Barre de progression accessible : le texte « 13 % — 400 € sur 3 000 € » est à la fois affiché et porté par la barre
 * (`aria-valuetext`). La couleur n'est qu'un renfort : le statut est écrit à côté.
 */
export function ProjectProgress({ project, showExpected = false }: Props) {
  const text = describeProgress(project);
  const expected = expectedPercent(project);
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Progression du projet"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={project.progressPercent}
        aria-valuetext={text}
        className="relative h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
      >
        <div className={`h-full rounded-full ${STATUS_STYLE[project.status].bar}`} style={{ width: `${project.progressPercent}%` }} />
        {showExpected && expected > 0 && expected < 100 && (
          <span className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${expected}%` }} aria-hidden="true" data-testid="expected-marker" />
        )}
      </div>
      <p className="tabular mt-1 font-body-sm text-body-sm font-semibold">{text}</p>
    </div>
  );
}
