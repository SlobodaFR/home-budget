import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateTransactionUseCase } from '../../../application/transaction/create-transaction.use-case';
import { DeleteTransactionUseCase } from '../../../application/transaction/delete-transaction.use-case';
import { ListRecentTransactionsUseCase } from '../../../application/transaction/list-recent-transactions.use-case';
import { UpdateTransactionUseCase } from '../../../application/transaction/update-transaction.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { SaveTransactionDto } from '../dto/save-transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly listRecentTransactions: ListRecentTransactionsUseCase,
    private readonly createTransaction: CreateTransactionUseCase,
    private readonly updateTransaction: UpdateTransactionUseCase,
    private readonly deleteTransaction: DeleteTransactionUseCase,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limit?: string,
  ) {
    return this.listRecentTransactions.execute(
      user.id,
      limit ? Number(limit) : undefined,
    );
  }

  @Post()
  create(
    @Body() dto: SaveTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.createTransaction.execute(
      {
        accountId: dto.accountId,
        label: dto.label,
        category: dto.category,
        amountCents: dto.amountCents,
        date: dto.date ? new Date(dto.date) : undefined,
      },
      user.id,
    );
  }

  @Put(':id')
  @HttpCode(204)
  update(
    @Param('id') id: string,
    @Body() dto: SaveTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.updateTransaction.execute(
      id,
      {
        accountId: dto.accountId,
        label: dto.label,
        category: dto.category,
        amountCents: dto.amountCents,
        date: dto.date ? new Date(dto.date) : undefined,
      },
      user.id,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.deleteTransaction.execute(id, user.id);
  }
}
