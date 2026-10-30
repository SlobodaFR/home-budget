import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/shared/clock';
import { DebtRepository } from '../../domain/debt/debt.repository';
import { DebtView, buildDebtViews } from '../../domain/debt/debt-view';
import { Space } from '../../domain/space/space';
import { SpaceAccessService } from '../household/space-access.service';

/** Crédits d'un espace avec leur amortissement simulé à la date du jour. */
@Injectable()
export class DebtViewsService {
  constructor(
    private readonly debts: DebtRepository,
    private readonly access: SpaceAccessService,
    private readonly clock: Clock,
  ) {}

  async forSpace(spaceId: string): Promise<DebtView[]> {
    return buildDebtViews(
      await this.debts.findBySpace(spaceId),
      this.clock.now(),
    );
  }

  /**
   * Revenus mensuels connus pour le taux d'endettement : somme des revenus nets
   * déclarés par les membres du foyer pour l'espace commun, revenu du
   * propriétaire pour un espace personnel ; null si inconnu ou nul.
   */
  async monthlyIncomeCents(
    userId: string,
    space: Space,
  ): Promise<number | null> {
    const snapshot = await this.access.requireSnapshot(userId);
    const incomes = snapshot.memberships
      .filter((m) => !space.isPersonal() || m.userId === space.ownerUserId)
      .map((m) => m.netMonthlyIncomeCents)
      .filter((v): v is number => v !== null);
    const total = incomes.reduce((sum, v) => sum + v, 0);
    return incomes.length > 0 && total > 0 ? total : null;
  }
}
