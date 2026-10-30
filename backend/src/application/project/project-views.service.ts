import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/shared/clock';
import { ProjectRepository } from '../../domain/project/project.repository';
import {
  ProjectView,
  buildProjectViews,
} from '../../domain/project/project-progress';

/** Projets d'un espace avec leur avancement à la date du jour. */
@Injectable()
export class ProjectViewsService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
  ) {}

  async forSpace(spaceId: string): Promise<ProjectView[]> {
    const [projects, deposits] = await Promise.all([
      this.projects.findBySpace(spaceId),
      this.projects.findDepositsBySpace(spaceId),
    ]);
    return buildProjectViews(projects, deposits, this.clock.now());
  }
}
