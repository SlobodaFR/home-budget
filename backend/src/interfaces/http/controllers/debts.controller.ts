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
  CreateDebtUseCase,
  DebtWhatIfUseCase,
  DeleteDebtUseCase,
  GetDebtsSummaryUseCase,
  ListDebtsUseCase,
  UpdateDebtUseCase,
} from '../../../application/debt/debt.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { CreateDebtDto, UpdateDebtDto, WhatIfQueryDto } from '../dto/debt.dto';

@Controller('spaces/:spaceId/debts')
export class DebtsController {
  constructor(
    private readonly list: ListDebtsUseCase,
    private readonly summary: GetDebtsSummaryUseCase,
    private readonly create: CreateDebtUseCase,
    private readonly update: UpdateDebtUseCase,
    private readonly remove: DeleteDebtUseCase,
    private readonly simulate: DebtWhatIfUseCase,
  ) {}

  @Get()
  debts(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.list.execute(user.id, spaceId);
  }

  // `summary` est déclaré AVANT toute route à paramètre `:id` pour ne pas être capturé par elle.
  @Get('summary')
  debtsSummary(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.summary.execute(user.id, spaceId);
  }

  @Post()
  add(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateDebtDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.create.execute(user.id, spaceId, dto);
  }

  @Put(':id')
  @HttpCode(204)
  save(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDebtDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.update.execute(user.id, spaceId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.remove.execute(user.id, spaceId, id);
  }

  @Get(':id/what-if')
  whatIf(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Query() query: WhatIfQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.simulate.execute(
      user.id,
      spaceId,
      id,
      query.extraMonthlyCents,
      query.lumpSumCents,
    );
  }
}
