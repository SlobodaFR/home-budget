import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  CommitImportUseCase,
  GetRulesUseCase,
  PreviewImportUseCase,
  SaveRulesUseCase,
} from '../../../application/import/import.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import {
  CommitImportDto,
  PreviewImportDto,
  SaveRulesDto,
} from '../dto/import.dto';

@Controller('spaces/:spaceId')
export class ImportsController {
  constructor(
    private readonly preview: PreviewImportUseCase,
    private readonly commit: CommitImportUseCase,
    private readonly getRules: GetRulesUseCase,
    private readonly saveRules: SaveRulesUseCase,
  ) {}

  @Post('imports/preview')
  @HttpCode(200)
  previewImport(
    @Param('spaceId') spaceId: string,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.preview.execute(user.id, spaceId, dto.text);
  }

  @Post('imports/commit')
  commitImport(
    @Param('spaceId') spaceId: string,
    @Body() dto: CommitImportDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.commit.execute(user.id, spaceId, dto.items);
  }

  @Get('rules')
  rules(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.getRules.execute(user.id, spaceId);
  }

  @Put('rules')
  @HttpCode(204)
  updateRules(
    @Param('spaceId') spaceId: string,
    @Body() dto: SaveRulesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.saveRules.execute(user.id, spaceId, dto.rules);
  }
}
