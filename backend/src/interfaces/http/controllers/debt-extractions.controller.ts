import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DeleteDebtExtractionUseCase,
  GetDebtExtractionUseCase,
  GetExtractionCapabilitiesUseCase,
  StartDebtExtractionUseCase,
} from '../../../application/debt-extraction/debt-extraction.use-cases';
import { MAX_DOCUMENT_BYTES } from '../../../domain/contract-extraction/document-text-extractor';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { UploadExceptionFilter } from '../upload-exception.filter';

/**
 * Import d'un contrat de prêt par OCR (tranche 13). Le multipart est reçu EN MÉMOIRE
 * (stockage par défaut de multer, aucun fichier n'est écrit sur le disque à la réception),
 * un seul fichier de 10 Mo au plus dans le champ `file`. La limite JSON de 1 Mo ne
 * s'applique qu'aux corps `application/json`.
 */
@Controller()
export class DebtExtractionsController {
  constructor(
    private readonly capabilitiesUseCase: GetExtractionCapabilitiesUseCase,
    private readonly start: StartDebtExtractionUseCase,
    private readonly get: GetDebtExtractionUseCase,
    private readonly remove: DeleteDebtExtractionUseCase,
  ) {}

  // Déclaré AVANT `:jobId` pour ne pas être capturé par lui.
  @Get('debt-extractions/capabilities')
  capabilities() {
    return this.capabilitiesUseCase.execute();
  }

  @Post('spaces/:spaceId/debts/extract')
  @HttpCode(202)
  @UseFilters(UploadExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 5, parts: 8 },
    }),
  )
  extract(
    @Param('spaceId') spaceId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.start.execute(user.id, spaceId, file?.buffer);
  }

  @Get('debt-extractions/:jobId')
  job(@Param('jobId') jobId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.get.execute(user.id, jobId);
  }

  @Delete('debt-extractions/:jobId')
  @HttpCode(204)
  delete(
    @Param('jobId') jobId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    this.remove.execute(user.id, jobId);
  }
}
