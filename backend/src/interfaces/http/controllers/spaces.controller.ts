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
import {
  GetSpacePlanUseCase,
  SaveSpacePlanUseCase,
} from '../../../application/space/space-plan.use-cases';
import {
  CreateSpaceTransactionUseCase,
  DeleteSpaceTransactionUseCase,
  GetMonthSummaryUseCase,
  ListSpaceTransactionsUseCase,
  UpdateSpaceTransactionUseCase,
} from '../../../application/space/space-transaction.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  MonthQueryDto,
  SavePlanDto,
  SaveTransactionDto,
} from '../dto/space.dto';

@Controller('spaces/:spaceId')
export class SpacesController {
  constructor(
    private readonly getPlan: GetSpacePlanUseCase,
    private readonly savePlan: SaveSpacePlanUseCase,
    private readonly listTransactions: ListSpaceTransactionsUseCase,
    private readonly createTransaction: CreateSpaceTransactionUseCase,
    private readonly updateTransaction: UpdateSpaceTransactionUseCase,
    private readonly deleteTransaction: DeleteSpaceTransactionUseCase,
    private readonly getSummary: GetMonthSummaryUseCase,
  ) {}

  @Get('plan')
  plan(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getPlan.execute(user.id, spaceId);
  }

  @Put('plan')
  @HttpCode(204)
  updatePlan(
    @Param('spaceId') spaceId: string,
    @Body() dto: SavePlanDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.savePlan.execute(user.id, spaceId, dto);
  }

  @Get('transactions')
  list(
    @Param('spaceId') spaceId: string,
    @Query() query: MonthQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listTransactions.execute(user.id, spaceId, query.month);
  }

  @Post('transactions')
  create(
    @Param('spaceId') spaceId: string,
    @Body() dto: SaveTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.createTransaction.execute(user.id, spaceId, dto);
  }

  @Put('transactions/:id')
  @HttpCode(204)
  update(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: SaveTransactionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.updateTransaction.execute(user.id, spaceId, id, dto);
  }

  @Delete('transactions/:id')
  @HttpCode(204)
  remove(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.deleteTransaction.execute(user.id, spaceId, id);
  }

  @Get('summary')
  summary(
    @Param('spaceId') spaceId: string,
    @Query() query: MonthQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getSummary.execute(user.id, spaceId, query.month);
  }
}
