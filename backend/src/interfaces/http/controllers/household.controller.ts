import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { GetContributionUseCase } from '../../../application/contribution/get-contribution.use-case';
import { CreateHouseholdUseCase } from '../../../application/household/create-household.use-case';
import { CreateInvitationUseCase } from '../../../application/household/create-invitation.use-case';
import { GetHouseholdUseCase } from '../../../application/household/get-household.use-case';
import { JoinHouseholdUseCase } from '../../../application/household/join-household.use-case';
import {
  SetContributionModeUseCase,
  SetMyIncomeUseCase,
} from '../../../application/household/update-household-settings.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  CreateHouseholdDto,
  JoinHouseholdDto,
  SetContributionModeDto,
  SetIncomeDto,
} from '../dto/household.dto';

@Controller('household')
export class HouseholdController {
  constructor(
    private readonly getHousehold: GetHouseholdUseCase,
    private readonly createHousehold: CreateHouseholdUseCase,
    private readonly createInvitation: CreateInvitationUseCase,
    private readonly joinHousehold: JoinHouseholdUseCase,
    private readonly setMyIncome: SetMyIncomeUseCase,
    private readonly setContributionMode: SetContributionModeUseCase,
    private readonly getContribution: GetContributionUseCase,
  ) {}

  @Get()
  get(@CurrentUser() user: CurrentUserPayload) {
    return this.getHousehold.execute(user.id);
  }

  @Post()
  async create(
    @Body() dto: CreateHouseholdDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { household: await this.createHousehold.execute(user.id, dto) };
  }

  @Post('invitations')
  invite(@CurrentUser() user: CurrentUserPayload) {
    return this.createInvitation.execute(user.id);
  }

  @Post('join')
  @HttpCode(200)
  async join(
    @Body() dto: JoinHouseholdDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return { household: await this.joinHousehold.execute(user.id, dto.code) };
  }

  @Put('me/income')
  @HttpCode(204)
  income(@Body() dto: SetIncomeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.setMyIncome.execute(user.id, dto.netMonthlyIncomeCents ?? null);
  }

  @Put('contribution-mode')
  @HttpCode(204)
  mode(
    @Body() dto: SetContributionModeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.setContributionMode.execute(user.id, dto.mode);
  }

  @Get('contribution')
  contribution(@CurrentUser() user: CurrentUserPayload) {
    return this.getContribution.execute(user.id);
  }
}
