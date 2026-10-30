import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PERSONAL_CONTRIBUTION_LABEL,
  assertContributionMonth,
  contributionLabel,
} from '../../domain/contribution/contribution-tracking';
import { Bloc } from '../../domain/shared/bloc';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { Money } from '../../domain/shared/money';
import { Transaction } from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { UserRepository } from '../../domain/user/user.repository';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { SpaceAccessService } from '../household/space-access.service';

export interface RecordContributionPaymentCommand {
  month: string;
  amountCents: number;
  date?: Date;
  accountId?: string | null;
  debitPersonal?: boolean;
  personalAccountId?: string | null;
  personalBloc?: Bloc;
}

export interface ContributionPaymentResult {
  transactionId: string;
  personalTransactionId: string | null;
}

/**
 * « J'ai versé ma contribution » : un revenu dans l'espace commun (avec le membre et
 * le mois), et en option la dépense correspondante dans l'espace personnel de l'auteur.
 * Les deux opérations n'ont aucun lien entre elles : le commun ne révèle rien du perso.
 * Tout est validé avant la première écriture, puis enregistré en une transaction.
 */
@Injectable()
export class RecordContributionPaymentUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly assignment: AccountAssignmentService,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    command: RecordContributionPaymentCommand,
  ): Promise<ContributionPaymentResult> {
    const snapshot = await this.access.requireSnapshot(userId);
    const common = snapshot.spaces.find((s) => s.kind === 'COMMON');
    const personal = snapshot.spaces.find(
      (s) => s.kind === 'PERSONAL' && s.ownerUserId === userId,
    );
    if (!common || !personal) {
      throw new NotFoundException('Espace introuvable');
    }

    const now = this.clock.now();
    assertContributionMonth(command.month, now);
    if (!Number.isInteger(command.amountCents) || command.amountCents <= 0) {
      throw new DomainError('Le montant doit être un entier de centimes > 0');
    }
    const debitPersonal = command.debitPersonal === true;
    const personalAccountGiven =
      command.personalAccountId !== undefined &&
      command.personalAccountId !== null;
    if (personalAccountGiven && !debitPersonal) {
      throw new DomainError(
        "Un compte personnel n'a de sens qu'avec debitPersonal : la dépense personnelle n'est pas demandée",
      );
    }

    const accountId = await this.assignment.resolve(
      common.id,
      command.accountId,
    );
    const personalAccountId = debitPersonal
      ? await this.assignment.resolve(personal.id, command.personalAccountId)
      : null;

    const date = command.date ?? now;
    const amount = Money.fromCents(command.amountCents);
    const memberName = (await this.users.findById(userId))?.name ?? '';

    const income = Transaction.create({
      id: randomUUID(),
      spaceId: common.id,
      kind: 'INCOME',
      bloc: null,
      label: contributionLabel(memberName),
      amount,
      date,
      accountId,
      contributionUserId: userId,
      contributionMonth: command.month,
    });
    const expense = debitPersonal
      ? Transaction.create({
          id: randomUUID(),
          spaceId: personal.id,
          kind: 'EXPENSE',
          bloc: command.personalBloc ?? 'FIXE',
          label: PERSONAL_CONTRIBUTION_LABEL,
          amount,
          date,
          accountId: personalAccountId,
        })
      : null;

    await this.transactions.saveMany(expense ? [income, expense] : [income]);
    return {
      transactionId: income.id,
      personalTransactionId: expense?.id ?? null,
    };
  }
}
