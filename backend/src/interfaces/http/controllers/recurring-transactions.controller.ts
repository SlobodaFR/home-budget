import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CreateRecurringTransactionUseCase } from '../../../application/recurring-transaction/create-recurring-transaction.use-case';
import { DeleteRecurringTransactionUseCase } from '../../../application/recurring-transaction/delete-recurring-transaction.use-case';
import { ListRecurringTransactionsUseCase } from '../../../application/recurring-transaction/list-recurring-transactions.use-case';
import { UpdateRecurringTransactionUseCase } from '../../../application/recurring-transaction/update-recurring-transaction.use-case';
import { GetBalanceForecastUseCase } from '../../../application/forecast/get-balance-forecast.use-case';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';
import { ForecastQueryDto } from '../dto/forecast-query.dto';
import { SaveRecurringTransactionDto } from '../dto/save-recurring-transaction.dto';

@Controller('recurring-transactions')
export class RecurringTransactionsController {
  constructor(
    private readonly listRecurringTransactions: ListRecurringTransactionsUseCase,
    private readonly createRecurringTransaction: CreateRecurringTransactionUseCase,
    private readonly updateRecurringTransaction: UpdateRecurringTransactionUseCase,
    private readonly deleteRecurringTransaction: DeleteRecurringTransactionUseCase,
    private readonly getBalanceForecast: GetBalanceForecastUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.listRecurringTransactions.execute(user.id);
  }

  @Get('forecast')
  forecast(@CurrentUser() user: CurrentUserPayload, @Query() query: ForecastQueryDto) {
    return this.getBalanceForecast.execute(user.id, new Date(query.date));
  }

  @Post()
  create(@Body() dto: SaveRecurringTransactionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.createRecurringTransaction.execute(toInput(dto), user.id);
  }

  @Put(':id')
  @HttpCode(204)
  update(@Param('id') id: string, @Body() dto: SaveRecurringTransactionDto, @CurrentUser() user: CurrentUserPayload) {
    return this.updateRecurringTransaction.execute(id, toInput(dto), user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.deleteRecurringTransaction.execute(id, user.id);
  }
}

function toInput(dto: SaveRecurringTransactionDto) {
  return {
    accountId: dto.accountId,
    label: dto.label,
    category: dto.category,
    amountCents: dto.amountCents,
    dayOfMonth: dto.dayOfMonth ?? null,
    startDate: new Date(dto.startDate),
    endDate: dto.endDate ? new Date(dto.endDate) : null,
    active: dto.active,
  };
}
