import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  DEFAULT_RULES,
  ClassificationRule,
  RuleTarget,
  classifyRow,
  normalizeText,
  validateRules,
} from '../../domain/import/classification';
import { SpaceRulesRepository } from '../../domain/import/space-rules.repository';
import { parseStatement } from '../../domain/import/statement-parser';
import { Bloc } from '../../domain/shared/bloc';
import { Money } from '../../domain/shared/money';
import {
  Transaction,
  TransactionKind,
} from '../../domain/transaction/transaction';
import { TransactionRepository } from '../../domain/transaction/transaction.repository';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { SpaceAccessService } from '../household/space-access.service';

export interface PreviewRowDto {
  index: number;
  date: string;
  label: string;
  amountCents: number;
  suggestion: { target: RuleTarget | null; rule: string | null };
  duplicate: boolean;
}

export interface PreviewDto {
  rows: PreviewRowDto[];
  skipped: { line: number; reason: string }[];
  truncated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lit un releve, propose un classement et repere les doublons. N'enregistre rien. */
@Injectable()
export class PreviewImportUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly rules: SpaceRulesRepository,
    private readonly transactions: TransactionRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    text: string,
    accountId?: string | null,
  ): Promise<PreviewDto> {
    await this.access.requireSpace(userId, spaceId);
    // Rien n'est rattaché par l'aperçu, mais un compte invalide est refusé dès maintenant.
    await this.assignment.resolve(spaceId, accountId);
    const parsed = parseStatement(text);
    const rules = (await this.rules.find(spaceId)) ?? DEFAULT_RULES;

    const remaining = await this.existingCounts(spaceId, parsed.rows);

    const rows = parsed.rows.map((row, index): PreviewRowDto => {
      const key = duplicateKey(row.date, row.amountCents, row.label);
      const left = remaining.get(key) ?? 0;
      const duplicate = left > 0;
      if (duplicate) {
        remaining.set(key, left - 1);
      }
      return {
        index,
        date: row.date.toISOString(),
        label: row.label,
        amountCents: row.amountCents,
        suggestion: classifyRow(row.label, row.amountCents, rules),
        duplicate,
      };
    });

    return { rows, skipped: parsed.skipped, truncated: parsed.truncated };
  }

  /** Nombre d'operations deja presentes par (jour, montant signe, libelle) : un doublon se consomme une fois. */
  private async existingCounts(
    spaceId: string,
    rows: { date: Date; amountCents: number; label: string }[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (rows.length === 0) {
      return counts;
    }
    const times = rows.map((row) => row.date.getTime());
    const from = new Date(Math.min(...times));
    const to = new Date(Math.max(...times) + DAY_MS);
    const existing = await this.transactions.findBySpaceAndPeriod(
      spaceId,
      from,
      to,
    );
    for (const transaction of existing) {
      const signed =
        transaction.kind === 'INCOME'
          ? transaction.amount.toCents()
          : -transaction.amount.toCents();
      const key = duplicateKey(transaction.date, signed, transaction.label);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }
}

function duplicateKey(date: Date, signedCents: number, label: string): string {
  return `${date.toISOString().slice(0, 10)}|${signedCents}|${normalizeText(label)}`;
}

export interface CommitItem {
  kind: TransactionKind;
  bloc?: Bloc | null;
  label: string;
  amountCents: number;
  date: Date;
}

export const MAX_COMMIT_ITEMS = 500;

/** Cree les operations validees par l'utilisateur, tout ou rien. */
@Injectable()
export class CommitImportUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly transactions: TransactionRepository,
    private readonly assignment: AccountAssignmentService,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    items: CommitItem[],
    accountId?: string | null,
  ): Promise<{ created: number }> {
    await this.access.requireSpace(userId, spaceId);
    // Toutes les opérations créées sont rattachées à ce compte (tout ou rien, comme le reste).
    const attachedTo = await this.assignment.resolve(spaceId, accountId);
    const built = items.map((item) =>
      Transaction.create({
        id: randomUUID(),
        spaceId,
        kind: item.kind,
        bloc: item.bloc ?? null,
        label: item.label,
        amount: Money.fromCents(item.amountCents),
        date: item.date,
        accountId: attachedTo,
      }),
    );
    await this.transactions.saveMany(built);
    return { created: built.length };
  }
}

export interface RulesDto {
  rules: ClassificationRule[];
  isDefault: boolean;
}

@Injectable()
export class GetRulesUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly rules: SpaceRulesRepository,
  ) {}

  async execute(userId: string, spaceId: string): Promise<RulesDto> {
    await this.access.requireSpace(userId, spaceId);
    const saved = await this.rules.find(spaceId);
    return saved
      ? { rules: saved, isDefault: false }
      : { rules: DEFAULT_RULES, isDefault: true };
  }
}

@Injectable()
export class SaveRulesUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly rules: SpaceRulesRepository,
  ) {}

  async execute(
    userId: string,
    spaceId: string,
    input: { keyword: string; target: string }[],
  ): Promise<void> {
    await this.access.requireSpace(userId, spaceId);
    await this.rules.save(spaceId, validateRules(input));
  }
}
