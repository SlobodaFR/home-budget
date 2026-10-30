import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetAidsUseCase } from '../../../application/aid/aid.use-cases';
import { GetForecastUseCase } from '../../../application/forecast/get-forecast.use-case';
import { GetInsightsUseCase } from '../../../application/insights/get-insights.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { AidsQueryDto } from '../dto/guidance.dto';
import { MonthQueryDto } from '../dto/space.dto';

/** Prévisionnel, prochaines actions et aides d'un espace. */
@Controller('spaces/:spaceId')
export class GuidanceController {
  constructor(
    private readonly getForecast: GetForecastUseCase,
    private readonly getInsights: GetInsightsUseCase,
    private readonly getAids: GetAidsUseCase,
  ) {}

  @Get('forecast')
  forecast(
    @Param('spaceId') spaceId: string,
    @Query() query: MonthQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getForecast.execute(user.id, spaceId, query.month);
  }

  @Get('insights')
  insights(
    @Param('spaceId') spaceId: string,
    @Query() query: MonthQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getInsights.execute(user.id, spaceId, query.month);
  }

  @Get('aids')
  aids(
    @Param('spaceId') spaceId: string,
    @Query() query: AidsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getAids.execute(user.id, spaceId, query.year);
  }
}
