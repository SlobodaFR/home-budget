import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { CreateAccountUseCase } from '../../../application/account/create-account.use-case';
import { DeleteAccountUseCase } from '../../../application/account/delete-account.use-case';
import { GetEquitySummaryUseCase } from '../../../application/account/get-equity-summary.use-case';
import { ListAccountsWithBalancesUseCase } from '../../../application/account/list-accounts-with-balances.use-case';
import { UpdateAccountUseCase } from '../../../application/account/update-account.use-case';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';
import { SaveAccountDto } from '../dto/save-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly listAccountsWithBalances: ListAccountsWithBalancesUseCase,
    private readonly getEquitySummary: GetEquitySummaryUseCase,
    private readonly createAccount: CreateAccountUseCase,
    private readonly updateAccount: UpdateAccountUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.listAccountsWithBalances.execute(user.id);
  }

  @Get('equity')
  equity(@CurrentUser() user: CurrentUserPayload) {
    return this.getEquitySummary.execute(user.id);
  }

  @Post()
  create(@Body() dto: SaveAccountDto, @CurrentUser() user: CurrentUserPayload) {
    return this.createAccount.execute(
      {
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        monthlyBudgetCents: dto.monthlyBudgetCents ?? null,
      },
      user.id,
    );
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(@Param('id') id: string, @Body() dto: SaveAccountDto, @CurrentUser() user: CurrentUserPayload) {
    return this.updateAccount.execute(
      id,
      {
        name: dto.name,
        type: dto.type,
        icon: dto.icon,
        monthlyBudgetCents: dto.monthlyBudgetCents ?? null,
      },
      user.id,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.deleteAccount.execute(id, user.id);
  }
}
