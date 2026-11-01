import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';
import { DomainError } from '../../domain/shared/domain-error';

const MULTER_MESSAGES: Record<string, string> = {
  'File too large': 'Le fichier dépasse la taille maximale de 10 Mo.',
  'Unexpected field': 'Envoyez un seul fichier, dans le champ « file ».',
  'Too many files': 'Envoyez un seul fichier, dans le champ « file ».',
};

function isMultipartError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /^(Multipart:|Unexpected end of form|Malformed part header|Part terminated early|Unexpected end of multipart)/.test(
      error.message,
    )
  );
}

/**
 * Erreurs de réception du multipart (multer) → 400 en français, comme le contrat de
 * l'API (taille ou format invalides). Tout le reste suit le comportement habituel.
 */
@Catch()
export class UploadExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Upload');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const bad = (message: string) =>
      response
        .status(HttpStatus.BAD_REQUEST)
        .json({ statusCode: 400, message, error: 'Bad Request' });

    if (exception instanceof DomainError) {
      bad(exception.message);
      return;
    }
    if (isMultipartError(exception)) {
      bad('Envoi invalide : joignez le fichier en multipart/form-data.');
      return;
    }
    const status =
      typeof (exception as { getStatus?: unknown }).getStatus === 'function'
        ? (exception as { getStatus: () => number }).getStatus()
        : 0;
    const message = (exception as { message?: unknown }).message;
    if (
      (status === 413 || status === 400) &&
      typeof message === 'string' &&
      message in MULTER_MESSAGES
    ) {
      bad(MULTER_MESSAGES[message]);
      return;
    }
    if (status === 413) {
      bad(MULTER_MESSAGES['File too large']);
      return;
    }
    if (!status) {
      // Erreur inattendue : jamais de détail dans la réponse (le message pourrait citer le document).
      this.logger.error(
        `Erreur inattendue (${exception instanceof Error ? exception.name : 'inconnue'})`,
      );
    }
    super.catch(exception, host);
  }
}
