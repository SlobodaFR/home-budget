import { Injectable } from '@nestjs/common';
import {
  ContributionStatus,
  contributionStatus,
} from '../../domain/contribution/contribution-tracking';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { SpaceAccessService } from '../household/space-access.service';
import { GetContributionUseCase } from './get-contribution.use-case';

export interface MemberContributionStatusDto {
  userId: string;
  name: string;
  /** null si la règle du foyer ne peut pas être calculée (revenus manquants). */
  expectedCents: number | null;
  paidCents: number;
  remainingCents: number | null;
  status: ContributionStatus;
  isMe: boolean;
}

export interface ContributionStatusDto {
  month: string;
  incomplete: boolean;
  members: MemberContributionStatusDto[];
  /** null quand `incomplete`. */
  totalExpectedCents: number | null;
  totalPaidCents: number;
}

/**
 * Attendu / versé / reste de chaque membre pour un mois. L'attendu vient du calcul
 * existant de `GET /household/contribution` (plan commun courant), jamais recalculé ici.
 */
@Injectable()
export class ContributionStatusService {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly contribution: GetContributionUseCase,
    private readonly transactions: TransactionRepository,
  ) {}

  async forMonth(
    userId: string,
    month: string,
  ): Promise<ContributionStatusDto> {
    const [rule, snapshot] = await Promise.all([
      this.contribution.execute(userId),
      this.access.requireSnapshot(userId),
    ]);
    const common = snapshot.spaces.find((s) => s.kind === 'COMMON');
    const paid = common
      ? await this.transactions.sumContributionsByUser(common.id, month)
      : new Map<string, number>();

    const members = rule.shares.map((share): MemberContributionStatusDto => {
      const expectedCents = rule.incomplete ? null : share.contributionCents;
      const paidCents = paid.get(share.userId) ?? 0;
      return {
        userId: share.userId,
        name: share.name,
        expectedCents,
        paidCents,
        ...contributionStatus(expectedCents, paidCents),
        isMe: share.userId === userId,
      };
    });

    return {
      month,
      incomplete: rule.incomplete,
      members,
      totalExpectedCents: rule.incomplete
        ? null
        : members.reduce((sum, m) => sum + (m.expectedCents ?? 0), 0),
      totalPaidCents: members.reduce((sum, m) => sum + m.paidCents, 0),
    };
  }
}
