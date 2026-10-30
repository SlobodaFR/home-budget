import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import {
  GetReviewUseCase,
  ListReviewsUseCase,
  SaveReviewUseCase,
} from '../../../application/review/review.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  ReviewMonthParamDto,
  ReviewsQueryDto,
  SaveReviewDto,
} from '../dto/review.dto';

@Controller('spaces/:spaceId/reviews')
export class ReviewsController {
  constructor(
    private readonly list: ListReviewsUseCase,
    private readonly get: GetReviewUseCase,
    private readonly save: SaveReviewUseCase,
  ) {}

  @Get()
  history(
    @Param('spaceId') spaceId: string,
    @Query() query: ReviewsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.list.execute(user.id, spaceId, query.limit);
  }

  @Get(':month')
  review(
    @Param('spaceId') spaceId: string,
    @Param() params: ReviewMonthParamDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.get.execute(user.id, spaceId, params.month);
  }

  @Put(':month')
  @HttpCode(204)
  update(
    @Param('spaceId') spaceId: string,
    @Param() params: ReviewMonthParamDto,
    @Body() dto: SaveReviewDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.save.execute(user.id, spaceId, params.month, dto);
  }
}
