import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountRepository } from '../../domain/account/account.repository';

@Injectable()
export class DeleteAccountUseCase {
  constructor(private readonly accountRepository: AccountRepository) {}

  async execute(id: string, userId: string): Promise<void> {
    const existing = await this.accountRepository.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    await this.accountRepository.delete(id);
  }
}
