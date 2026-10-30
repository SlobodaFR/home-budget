import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  CreateLifeEventUseCase,
  DeleteLifeEventUseCase,
  GetLifeEventCatalogUseCase,
  ListLifeEventsUseCase,
  SetLifeEventStepUseCase,
  UpdateLifeEventUseCase,
} from '../../../application/life-event/life-event.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  CreateLifeEventDto,
  SetLifeEventStepDto,
  UpdateLifeEventDto,
} from '../dto/life-event.dto';

/** Catalogue des événements de vie : du code, lisible par tout utilisateur authentifié. */
@Controller('life-events')
export class LifeEventCatalogController {
  constructor(private readonly catalog: GetLifeEventCatalogUseCase) {}

  @Get('catalog')
  get() {
    return this.catalog.execute();
  }
}

/** Événements de vie du foyer : visibles et modifiables par tous ses membres. */
@Controller('household/life-events')
export class HouseholdLifeEventsController {
  constructor(
    private readonly list: ListLifeEventsUseCase,
    private readonly create: CreateLifeEventUseCase,
    private readonly update: UpdateLifeEventUseCase,
    private readonly remove: DeleteLifeEventUseCase,
    private readonly setStep: SetLifeEventStepUseCase,
  ) {}

  @Get()
  events(@CurrentUser() user: CurrentUserPayload) {
    return this.list.execute(user.id);
  }

  @Post()
  add(
    @Body() dto: CreateLifeEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.create.execute(user.id, dto);
  }

  @Put(':id')
  @HttpCode(204)
  save(
    @Param('id') id: string,
    @Body() dto: UpdateLifeEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.update.execute(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.remove.execute(user.id, id);
  }

  @Put(':id/steps/:stepId')
  @HttpCode(204)
  step(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: SetLifeEventStepDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.setStep.execute(user.id, id, stepId, dto);
  }
}
