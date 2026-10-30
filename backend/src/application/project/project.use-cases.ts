import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Project, ProjectKind } from '../../domain/project/project';
import { ProjectDeposit } from '../../domain/project/project-deposit';
import { ProjectRepository } from '../../domain/project/project.repository';
import {
  ProjectsSummary,
  buildProjectView,
  savedCents,
  summarizeProjects,
} from '../../domain/project/project-progress';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { SpaceAccessService } from '../household/space-access.service';
import {
  DepositDto,
  ProjectDto,
  toDepositDto,
  toProjectDto,
} from './project.dto';
import { ProjectViewsService } from './project-views.service';

export interface SaveProjectCommand {
  name: string;
  kind: ProjectKind;
  targetCents: number;
  targetDate: string;
  startCents: number;
  startDate: string;
  accountId?: string | null;
  /** Pris en compte à la modification seulement ; absent = inchangé. */
  archived?: boolean;
}

export interface AddDepositCommand {
  date: string;
  amountCents: number;
  note?: string | null;
}

const NEGATIVE_SAVINGS =
  "Ce montant rendrait l'épargne du projet négative : le retrait dépasse ce qui a été épargné";

async function requireProject(
  projects: ProjectRepository,
  id: string,
  spaceId: string,
): Promise<Project> {
  const project = await projects.findById(id);
  if (!project || project.spaceId !== spaceId) {
    throw new NotFoundException('Projet introuvable');
  }
  return project;
}

@Injectable()
export class ListProjectsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: ProjectViewsService,
  ) {}

  async execute(userId: string, spaceId: string): Promise<ProjectDto[]> {
    await this.access.requireSpace(userId, spaceId);
    return (await this.views.forSpace(spaceId)).map(toProjectDto);
  }
}

@Injectable()
export class GetProjectsSummaryUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly views: ProjectViewsService,
    private readonly plans: SpacePlanRepository,
  ) {}

  async execute(userId: string, spaceId: string): Promise<ProjectsSummary> {
    await this.access.requireSpace(userId, spaceId);
    const [views, plan] = await Promise.all([
      this.views.forSpace(spaceId),
      this.plans.find(spaceId),
    ]);
    return summarizeProjects(views, (plan ?? SpacePlan.empty()).epargneCents);
  }
}

@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
    private readonly assignment: AccountAssignmentService,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    command: SaveProjectCommand,
  ): Promise<ProjectDto> {
    await this.access.requireSpace(userId, spaceId);
    const accountId = await this.assignment.resolve(spaceId, command.accountId);
    const project = Project.create({
      id: randomUUID(),
      spaceId,
      name: command.name,
      kind: command.kind,
      targetCents: command.targetCents,
      targetDate: command.targetDate,
      startCents: command.startCents,
      startDate: command.startDate,
      archived: false,
      accountId,
    });
    await this.projects.save(project);
    return toProjectDto(buildProjectView(project, [], this.clock.now()));
  }
}

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    id: string,
    command: SaveProjectCommand,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const existing = await requireProject(this.projects, id, spaceId);
    // Garder un compte archivé reste permis (corriger un projet ancien).
    const accountId = await this.assignment.resolve(
      spaceId,
      command.accountId,
      existing.accountId,
    );
    const updated = Project.create({
      id,
      spaceId,
      name: command.name,
      kind: command.kind,
      targetCents: command.targetCents,
      targetDate: command.targetDate,
      startCents: command.startCents,
      startDate: command.startDate,
      archived: command.archived ?? existing.archived,
      accountId,
    });
    // Baisser le montant de départ ne doit pas rendre l'épargne négative.
    const deposits = await this.projects.findDepositsByProject(id);
    if (savedCents(updated, deposits) < 0) {
      throw new DomainError(NEGATIVE_SAVINGS);
    }
    await this.projects.save(updated);
  }
}

@Injectable()
export class DeleteProjectUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
  ) {}

  /** Supprime aussi les versements du projet. */
  async execute(userId: string, spaceId: string, id: string): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    await requireProject(this.projects, id, spaceId);
    await this.projects.delete(id);
  }
}

@Injectable()
export class ListDepositsUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
  ) {}

  /** Du plus récent au plus ancien. */
  async execute(
    userId: string,
    spaceId: string,
    projectId: string,
  ): Promise<DepositDto[]> {
    await this.access.requireSpace(userId, spaceId);
    await requireProject(this.projects, projectId, spaceId);
    const deposits = await this.projects.findDepositsByProject(projectId);
    return deposits
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .map(toDepositDto);
  }
}

@Injectable()
export class AddDepositUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    projectId: string,
    command: AddDepositCommand,
  ): Promise<DepositDto> {
    await this.access.requireSpace(userId, spaceId);
    const project = await requireProject(this.projects, projectId, spaceId);
    const deposit = ProjectDeposit.create({
      id: randomUUID(),
      projectId,
      spaceId,
      date: command.date,
      amountCents: command.amountCents,
      note: command.note ?? '',
    });
    const existing = await this.projects.findDepositsByProject(projectId);
    if (savedCents(project, [...existing, deposit]) < 0) {
      throw new DomainError(NEGATIVE_SAVINGS);
    }
    await this.projects.saveDeposit(deposit);
    return toDepositDto(deposit);
  }
}

@Injectable()
export class DeleteDepositUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly projects: ProjectRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    projectId: string,
    depositId: string,
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    const project = await requireProject(this.projects, projectId, spaceId);
    const deposit = await this.projects.findDepositById(depositId);
    if (!deposit || deposit.projectId !== projectId) {
      throw new NotFoundException('Versement introuvable');
    }
    // Supprimer un versement couvert par un retrait ultérieur rendrait l'épargne négative.
    const remaining = (
      await this.projects.findDepositsByProject(projectId)
    ).filter((d) => d.id !== depositId);
    if (savedCents(project, remaining) < 0) {
      throw new DomainError(NEGATIVE_SAVINGS);
    }
    await this.projects.deleteDeposit(depositId);
  }
}
