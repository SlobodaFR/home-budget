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
  CreateRecurringItemUseCase,
  DeleteRecurringItemUseCase,
  ListRecurringItemsUseCase,
  UpdateRecurringItemUseCase,
} from '../../../application/recurring/recurring.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { SaveRecurringDto } from '../dto/guidance.dto';

@Controller('spaces/:spaceId/recurring')
export class RecurringController {
  constructor(
    private readonly list: ListRecurringItemsUseCase,
    private readonly create: CreateRecurringItemUseCase,
    private readonly update: UpdateRecurringItemUseCase,
    private readonly remove: DeleteRecurringItemUseCase,
  ) {}

  @Get()
  items(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.list.execute(user.id, spaceId);
  }

  @Post()
  add(
    @Param('spaceId') spaceId: string,
    @Body() dto: SaveRecurringDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.create.execute(user.id, spaceId, dto);
  }

  @Put(':id')
  @HttpCode(204)
  save(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: SaveRecurringDto,
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
}
