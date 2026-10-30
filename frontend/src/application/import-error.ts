import { ApiError } from '../infrastructure/api-client';
import { describeError } from './error-message';

export function describeImportError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return 'Le relevé est trop volumineux pour le serveur (1 Mo au maximum).';
    }
    if (error.status === 400) {
      return `${fallback} Le serveur répond : ${error.message}`;
    }
  }
  return describeError(error, fallback);
}
