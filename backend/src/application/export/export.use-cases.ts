import { Injectable } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';
import { FiscalProfileRepository } from '../../domain/aid/fiscal-profile.repository';
import {
  TransactionCsvRow,
  buildTransactionsCsv,
} from '../../domain/export/csv';
import { ProjectRepository } from '../../domain/project/project.repository';
import { RecurringItemRepository } from '../../domain/recurring/recurring-item.repository';
import { MonthReviewRepository } from '../../domain/review/month-review.repository';
import { SafetyNetRepository } from '../../domain/safety-net/safety-net.repository';
import { addDays, parseIsoDate, toIsoDate } from '../../domain/shared/calendar';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpacePlan } from '../../domain/space/space-plan';
import { SpacePlanRepository } from '../../domain/space/space-plan.repository';
import { isVisibleTo } from '../../domain/space/space';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { HouseholdViewBuilder } from '../household/household.dto';
import { SpaceAccessService } from '../household/space-access.service';
import { toRecurringItemDto } from '../recurring/recurring.dto';
import { toTransactionDto } from '../space/transaction.dto';

/** Une période d'export CSV couvre 366 jours au plus (limites incluses). */
export const MAX_EXPORT_DAYS = 366;

/** Début des temps pour lire « toutes les opérations » d'un espace. */
const EPOCH = new Date(0);

/**
 * Sauvegarde JSON de tout ce que l'utilisateur peut lire : le foyer, l'espace
 * commun et SON espace personnel (déchiffré par les dépôts, pour lui seul).
 * L'espace personnel d'un autre membre n'est jamais lu : le filtre est
 * `isVisibleTo`, comme partout. On ne compose l'export qu'à partir d'objets du
 * domaine : aucune clé (PERSONAL_DATA_KEY), aucun jeton, aucun chiffré ni
 * adresse e-mail n'y entre.
 *
 * Un utilisateur sans foyer reçoit un 404 « Aucun foyer », comme les autres routes du foyer.
 */
@Injectable()
export class ExportDataUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly households: HouseholdViewBuilder,
    private readonly plans: SpacePlanRepository,
    private readonly transactions: TransactionRepository,
    private readonly recurring: RecurringItemRepository,
    private readonly accounts: AccountRepository,
    private readonly projects: ProjectRepository,
    private readonly reviews: MonthReviewRepository,
    private readonly safetyNets: SafetyNetRepository,
    private readonly fiscalProfiles: FiscalProfileRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<{ filename: string; data: object }> {
    const snapshot = await this.access.requireSnapshot(userId);
    const now = this.clock.now();
    const household = await this.households.build(snapshot, userId);

    const spaces = [];
    for (const space of snapshot.spaces.filter((s) => isVisibleTo(s, userId))) {
      const [
        plan,
        transactions,
        recurring,
        accounts,
        projects,
        deposits,
        reviews,
      ] = await Promise.all([
        this.plans.find(space.id),
        this.transactions.findBySpaceFrom(space.id, EPOCH),
        this.recurring.findBySpace(space.id),
        this.accounts.findBySpace(space.id),
        this.projects.findBySpace(space.id),
        this.projects.findDepositsBySpace(space.id),
        this.reviews.findBySpace(space.id),
      ]);
      spaces.push({
        space: { id: space.id, kind: space.kind, name: space.name },
        plan: (plan ?? SpacePlan.empty()).toProps(),
        transactions: transactions.map(toTransactionDto),
        recurring: recurring.map(toRecurringItemDto),
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          openingBalanceCents: a.openingBalanceCents,
          openingDate: a.openingDate,
          archived: a.archived,
        })),
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          targetCents: p.targetCents,
          targetDate: p.targetDate,
          startCents: p.startCents,
          startDate: p.startDate,
          archived: p.archived,
          accountId: p.accountId,
          deposits: deposits
            .filter((d) => d.projectId === p.id)
            .map((d) => ({
              id: d.id,
              date: d.date,
              amountCents: d.amountCents,
              note: d.note,
            })),
        })),
        reviews: reviews.map((r) => ({
          month: r.month,
          status: r.status,
          answers: r.answers,
          completedAt: r.completedAt?.toISOString() ?? null,
        })),
      });
    }

    const [safetyNet, fiscalProfile] = await Promise.all([
      this.safetyNets.find(snapshot.household.id),
      this.fiscalProfiles.find(snapshot.household.id),
    ]);

    return {
      filename: `budget-export-${toIsoDate(now)}.json`,
      data: {
        exportedAt: now.toISOString(),
        version: 1,
        household,
        spaces,
        safetyNet: safetyNet ? safetyNet.toProps() : null,
        fiscalProfile: fiscalProfile ? fiscalProfile.toProps() : null,
      },
    };
  }
}

/** Export CSV des opérations d'une période (limites incluses, 366 jours au plus). */
@Injectable()
export class ExportTransactionsCsvUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    from: string,
    to: string,
  ): Promise<{ filename: string; content: string }> {
    await this.access.requireSpace(userId, spaceId);
    const start = parseIsoDate(from, 'Date de début (from)');
    const end = parseIsoDate(to, 'Date de fin (to)');
    if (end.getTime() < start.getTime()) {
      throw new DomainError('La date de fin précède la date de début');
    }
    const days =
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > MAX_EXPORT_DAYS) {
      throw new DomainError(
        `La période d'export est limitée à ${MAX_EXPORT_DAYS} jours`,
      );
    }

    const [transactions, accounts] = await Promise.all([
      this.transactions.findBySpaceAndPeriod(spaceId, start, addDays(end, 1)),
      this.accounts.findBySpace(spaceId),
    ]);
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
    const rows: TransactionCsvRow[] = transactions
      .sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id),
      )
      .map((t) => ({
        date: toIsoDate(t.date),
        kind: t.kind,
        bloc: t.bloc,
        label: t.label,
        amountCents: t.amount.toCents(),
        accountName: t.accountId ? (accountNames.get(t.accountId) ?? '') : '',
      }));
    return {
      filename: `operations-${from}_${to}.csv`,
      content: buildTransactionsCsv(rows),
    };
  }
}
