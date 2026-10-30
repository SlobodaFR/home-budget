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
  CreateAccountUseCase,
  DeleteAccountUseCase,
  ListAccountsUseCase,
  UpdateAccountUseCase,
} from '../../../application/account/account.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { CreateAccountDto, UpdateAccountDto } from '../dto/account.dto';

@Controller('spaces/:spaceId/accounts')
export class AccountsController {
  constructor(
    private readonly list: ListAccountsUseCase,
    private readonly create: CreateAccountUseCase,
    private readonly update: UpdateAccountUseCase,
    private readonly remove: DeleteAccountUseCase,
  ) {}

  @Get()
  accounts(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.list.execute(user.id, spaceId);
  }

  @Post()
  add(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateAccountDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.create.execute(user.id, spaceId, dto);
  }

  @Put(':id')
  @HttpCode(204)
  save(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
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
