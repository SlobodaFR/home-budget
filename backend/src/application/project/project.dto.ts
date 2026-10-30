import { ProjectDeposit } from '../../domain/project/project-deposit';
import { ProjectKind } from '../../domain/project/project';
import {
  ProjectStatus,
  ProjectView,
} from '../../domain/project/project-progress';

export interface ProjectDto {
  id: string;
  spaceId: string;
  name: string;
  kind: ProjectKind;
  targetCents: number;
  targetDate: string;
  startCents: number;
  startDate: string;
  savedCents: number;
  remainingCents: number;
  progressPercent: number;
  monthsLeft: number;
  monthlyNeededCents: number;
  status: ProjectStatus;
  expectedSavedCents: number;
  archived: boolean;
  accountId: string | null;
}

export function toProjectDto(view: ProjectView): ProjectDto {
  const p = view.project;
  return {
    id: p.id,
    spaceId: p.spaceId,
    name: p.name,
    kind: p.kind,
    targetCents: p.targetCents,
    targetDate: p.targetDate,
    startCents: p.startCents,
    startDate: p.startDate,
    savedCents: view.savedCents,
    remainingCents: view.remainingCents,
    progressPercent: view.progressPercent,
    monthsLeft: view.monthsLeft,
    monthlyNeededCents: view.monthlyNeededCents,
    status: view.status,
    expectedSavedCents: view.expectedSavedCents,
    archived: p.archived,
    accountId: p.accountId,
  };
}

export interface DepositDto {
  id: string;
  date: string;
  amountCents: number;
  note: string;
}

export function toDepositDto(deposit: ProjectDeposit): DepositDto {
  return {
    id: deposit.id,
    date: deposit.date,
    amountCents: deposit.amountCents,
    note: deposit.note,
  };
}
