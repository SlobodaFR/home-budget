import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ExportDataUseCase,
  ExportTransactionsCsvUseCase,
} from '../../../application/export/export.use-cases';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { TransactionsExportQueryDto } from '../dto/review.dto';

/** Exports : sauvegarde JSON de l'utilisateur et CSV des opérations d'un espace. */
@Controller()
export class ExportController {
  constructor(
    private readonly exportData: ExportDataUseCase,
    private readonly exportCsv: ExportTransactionsCsvUseCase,
  ) {}

  @Get('export')
  async data(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, data } = await this.exportData.execute(user.id);
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    return data;
  }

  @Get('spaces/:spaceId/transactions/export')
  async transactions(
    @Param('spaceId') spaceId: string,
    @Query() query: TransactionsExportQueryDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, content } = await this.exportCsv.execute(
      user.id,
      spaceId,
      query.from,
      query.to,
    );
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return content;
  }
}
