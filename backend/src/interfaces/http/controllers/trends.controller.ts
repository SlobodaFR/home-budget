import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetTrendsUseCase } from '../../../application/trend/get-trends.use-case';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { TrendsQueryDto } from '../dto/trends.dto';

@Controller('spaces/:spaceId/trends')
export class TrendsController {
  constructor(private readonly trends: GetTrendsUseCase) {}

  @Get()
  get(
    @Param('spaceId') spaceId: string,
    @Query() query: TrendsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.trends.execute(user.id, spaceId, query.months, query.to);
  }
}
