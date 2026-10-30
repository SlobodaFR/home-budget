import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountKind } from '../../../domain/account/account';
import { AccountRepository } from '../../../domain/account/account.repository';
import { FieldCipher } from '../../../domain/shared/field-cipher';
import { AccountOrmEntity } from '../entities/account.orm-entity';
import { SpaceOrmEntity } from '../entities/space.orm-entity';

interface SecretPayload {
  name: string;
  openingBalanceCents: number;
}

/**
 * Espace commun : nom et solde d'ouverture en clair. Espace personnel : ils sont
 * chiffrés (clé du propriétaire, AAD lié à la ligne) ; type, date d'ouverture et
 * état d'archivage restent en clair.
 */
@Injectable()
export class TypeOrmAccountRepository extends AccountRepository {
  constructor(
    @InjectRepository(AccountOrmEntity)
    private readonly accounts: Repository<AccountOrmEntity>,
    @InjectRepository(SpaceOrmEntity)
    private readonly spaces: Repository<SpaceOrmEntity>,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async findBySpace(spaceId: string): Promise<Account[]> {
    const space = await this.spaces.findOneByOrFail({ id: spaceId });
    const rows = await this.accounts.find({
      where: { spaceId },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toDomain(row, space.ownerUserId));
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.accounts.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    const space = await this.spaces.findOneByOrFail({ id: row.spaceId });
    return this.toDomain(row, space.ownerUserId);
  }

  async save(account: Account): Promise<void> {
    const space = await this.spaces.findOneByOrFail({ id: account.spaceId });
    const base = {
      id: account.id,
      spaceId: account.spaceId,
      kind: account.kind,
      openingDate: account.openingDate,
      archived: account.archived,
    };
    if (space.ownerUserId) {
      const secret: SecretPayload = {
        name: account.name,
        openingBalanceCents: account.openingBalanceCents,
      };
      await this.accounts.save({
        ...base,
        name: null,
        openingBalanceCents: null,
        secretPayload: this.cipher.encrypt(
          space.ownerUserId,
          aad(account.id, account.spaceId),
          JSON.stringify(secret),
        ),
      });
      return;
    }
    await this.accounts.save({
      ...base,
      name: account.name,
      openingBalanceCents: account.openingBalanceCents,
      secretPayload: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.accounts.delete({ id });
  }

  private toDomain(row: AccountOrmEntity, ownerUserId: string | null): Account {
    let name = row.name ?? '';
    let openingBalanceCents = row.openingBalanceCents ?? 0;
    if (ownerUserId && row.secretPayload) {
      const secret = JSON.parse(
        this.cipher.decrypt(
          ownerUserId,
          aad(row.id, row.spaceId),
          row.secretPayload,
        ),
      ) as SecretPayload;
      name = secret.name;
      openingBalanceCents = secret.openingBalanceCents;
    }
    return Account.create({
      id: row.id,
      spaceId: row.spaceId,
      name,
      kind: row.kind as AccountKind,
      openingBalanceCents,
      openingDate: row.openingDate,
      archived: Boolean(row.archived),
    });
  }
}

function aad(id: string, spaceId: string): string {
  return `acc:${spaceId}:${id}`;
}
