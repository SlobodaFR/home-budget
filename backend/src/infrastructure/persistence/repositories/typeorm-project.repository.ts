import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { Project, ProjectKind } from '../../../domain/project/project';
import { ProjectDeposit } from '../../../domain/project/project-deposit';
import { ProjectRepository } from '../../../domain/project/project.repository';
import { ProjectDepositOrmEntity } from '../entities/project-deposit.orm-entity';
import { ProjectOrmEntity } from '../entities/project.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

interface ProjectSecret {
  name: string;
  targetCents: number;
  startCents: number;
}

interface DepositSecret {
  amountCents: number;
  note: string;
}

/**
 * Espace commun : tout en clair. Espace personnel : nom, objectif, solde initial,
 * montants et notes des versements sont chiffrés (clé du propriétaire, AAD lié à
 * la ligne) ; types, dates, archivage et compte restent en clair.
 */
@Injectable()
export class TypeOrmProjectRepository extends ProjectRepository {
  constructor(
    @InjectRepository(ProjectOrmEntity)
    private readonly projects: Repository<ProjectOrmEntity>,
    @InjectRepository(ProjectDepositOrmEntity)
    private readonly deposits: Repository<ProjectDepositOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findBySpace(spaceId: string): Promise<Project[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.projects.find({
      where: { spaceId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toProject(row, space.ownerUserId));
  }

  async findById(id: string): Promise<Project | null> {
    const row = await this.projects.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toProject(row, space.ownerUserId);
  }

  async save(project: Project): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: project.spaceId });
    const base = {
      id: project.id,
      spaceId: project.spaceId,
      kind: project.kind,
      targetDate: project.targetDate,
      startDate: project.startDate,
      archived: project.archived,
      accountId: project.accountId,
    };
    if (space.ownerUserId) {
      const secret: ProjectSecret = {
        name: project.name,
        targetCents: project.targetCents,
        startCents: project.startCents,
      };
      await this.projects.save({
        ...base,
        name: null,
        targetCents: null,
        startCents: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          projectAad(project.id, project.spaceId),
          JSON.stringify(secret),
        ),
      });
      return;
    }
    await this.projects.save({
      ...base,
      name: project.name,
      targetCents: project.targetCents,
      startCents: project.startCents,
      secretPayload: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.projects.manager.transaction(async (manager) => {
      await manager.delete(ProjectDepositOrmEntity, { projectId: id });
      await manager.delete(ProjectOrmEntity, { id });
    });
  }

  async countByAccount(accountId: string): Promise<number> {
    return this.projects.count({ where: { accountId } });
  }

  async findDepositsByProject(projectId: string): Promise<ProjectDeposit[]> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) {
      return [];
    }
    const space = await this.spaces.findOneByOrFail({ id: project.spaceId });
    const rows = await this.deposits.find({
      where: { projectId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDeposit(row, space.ownerUserId));
  }

  async findDepositsBySpace(spaceId: string): Promise<ProjectDeposit[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.deposits.find({
      where: { spaceId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDeposit(row, space.ownerUserId));
  }

  async findDepositById(id: string): Promise<ProjectDeposit | null> {
    const row = await this.deposits.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toDeposit(row, space.ownerUserId);
  }

  async saveDeposit(deposit: ProjectDeposit): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: deposit.spaceId });
    const base = {
      id: deposit.id,
      projectId: deposit.projectId,
      spaceId: deposit.spaceId,
      date: deposit.date,
    };
    if (space.ownerUserId) {
      const secret: DepositSecret = {
        amountCents: deposit.amountCents,
        note: deposit.note,
      };
      await this.deposits.save({
        ...base,
        amountCents: null,
        note: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          depositAad(deposit.id, deposit.projectId, deposit.spaceId),
          JSON.stringify(secret),
        ),
      });
      return;
    }
    await this.deposits.save({
      ...base,
      amountCents: deposit.amountCents,
      note: deposit.note,
      secretPayload: null,
    });
  }

  async deleteDeposit(id: string): Promise<void> {
    await this.deposits.delete({ id });
  }

  private toProject(
    row: ProjectOrmEntity,
    ownerUserId: string | null,
  ): Project {
    let name = row.name ?? '';
    let targetCents = row.targetCents ?? 1;
    let startCents = row.startCents ?? 0;
    if (ownerUserId && row.secretPayload) {
      const secret = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          projectAad(row.id, row.spaceId),
          row.secretPayload,
        ),
      ) as ProjectSecret;
      ({ name, targetCents, startCents } = secret);
    }
    return Project.create({
      id: row.id,
      spaceId: row.spaceId,
      name,
      kind: row.kind as ProjectKind,
      targetCents,
      targetDate: row.targetDate,
      startCents,
      startDate: row.startDate,
      archived: Boolean(row.archived),
      accountId: row.accountId,
    });
  }

  private toDeposit(
    row: ProjectDepositOrmEntity,
    ownerUserId: string | null,
  ): ProjectDeposit {
    let amountCents = row.amountCents ?? 1;
    let note = row.note ?? '';
    if (ownerUserId && row.secretPayload) {
      const secret = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          depositAad(row.id, row.projectId, row.spaceId),
          row.secretPayload,
        ),
      ) as DepositSecret;
      ({ amountCents, note } = secret);
    }
    return ProjectDeposit.create({
      id: row.id,
      projectId: row.projectId,
      spaceId: row.spaceId,
      date: row.date,
      amountCents,
      note,
    });
  }
}

function projectAad(id: string, spaceId: string): string {
  return `proj:${spaceId}:${id}`;
}

function depositAad(id: string, projectId: string, spaceId: string): string {
  return `pdep:${spaceId}:${projectId}:${id}`;
}
