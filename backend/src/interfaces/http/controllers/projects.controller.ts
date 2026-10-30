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
  AddDepositUseCase,
  CreateProjectUseCase,
  DeleteDepositUseCase,
  DeleteProjectUseCase,
  GetProjectsSummaryUseCase,
  ListDepositsUseCase,
  ListProjectsUseCase,
  UpdateProjectUseCase,
} from '../../../application/project/project.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  AddDepositDto,
  CreateProjectDto,
  UpdateProjectDto,
} from '../dto/project.dto';

@Controller('spaces/:spaceId/projects')
export class ProjectsController {
  constructor(
    private readonly list: ListProjectsUseCase,
    private readonly summary: GetProjectsSummaryUseCase,
    private readonly create: CreateProjectUseCase,
    private readonly update: UpdateProjectUseCase,
    private readonly remove: DeleteProjectUseCase,
    private readonly listDeposits: ListDepositsUseCase,
    private readonly addDeposit: AddDepositUseCase,
    private readonly removeDeposit: DeleteDepositUseCase,
  ) {}

  @Get()
  projects(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.list.execute(user.id, spaceId);
  }

  // `summary` est déclaré AVANT toute route à paramètre `:id` pour ne pas être capturé par elle.
  @Get('summary')
  projectsSummary(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.summary.execute(user.id, spaceId);
  }

  @Post()
  add(
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.create.execute(user.id, spaceId, dto);
  }

  @Put(':id')
  @HttpCode(204)
  save(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
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

  @Get(':id/deposits')
  deposits(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listDeposits.execute(user.id, spaceId, id);
  }

  @Post(':id/deposits')
  deposit(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Body() dto: AddDepositDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.addDeposit.execute(user.id, spaceId, id, dto);
  }

  @Delete(':id/deposits/:depositId')
  @HttpCode(204)
  deleteDeposit(
    @Param('spaceId') spaceId: string,
    @Param('id') id: string,
    @Param('depositId') depositId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.removeDeposit.execute(user.id, spaceId, id, depositId);
  }
}
