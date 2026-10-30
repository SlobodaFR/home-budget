import { Project } from './project';
import { ProjectDeposit } from './project-deposit';

/**
 * Port (driven side). Nom, objectif, solde initial, montants et notes d'un
 * espace personnel sont chiffrés par l'infrastructure.
 */
export abstract class ProjectRepository {
  abstract findBySpace(spaceId: string): Promise<Project[]>;
  abstract findById(id: string): Promise<Project | null>;
  abstract save(project: Project): Promise<void>;
  /** Supprime le projet ET tous ses versements, en une transaction. */
  abstract delete(id: string): Promise<void>;
  /** Nombre de projets rattachés au compte. */
  abstract countByAccount(accountId: string): Promise<number>;

  abstract findDepositsByProject(projectId: string): Promise<ProjectDeposit[]>;
  /** Les versements de tous les projets de l'espace. */
  abstract findDepositsBySpace(spaceId: string): Promise<ProjectDeposit[]>;
  abstract findDepositById(id: string): Promise<ProjectDeposit | null>;
  abstract saveDeposit(deposit: ProjectDeposit): Promise<void>;
  abstract deleteDeposit(id: string): Promise<void>;
}
