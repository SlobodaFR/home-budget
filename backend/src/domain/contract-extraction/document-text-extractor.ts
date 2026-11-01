import { DomainError } from '../shared/domain-error';
import { DocumentKind } from './document-kind';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 40;

export type OcrEngineName = 'tesseract' | 'ocrs';

export interface ExtractionCapabilities {
  /** Tous les outils système nécessaires sont présents. */
  available: boolean;
  engines: OcrEngineName[];
  maxFileBytes: number;
  maxPages: number;
}

export interface DocumentInfo {
  kind: DocumentKind;
  pages: number;
}

export interface DocumentText {
  /** `TEXT_LAYER` : texte du PDF, sans OCR. */
  source: 'TEXT_LAYER' | 'OCR';
  engine: OcrEngineName | null;
  /** Une chaîne par page. */
  pages: string[];
}

export type ExtractionStage = 'TEXT' | 'OCR';

export interface ExtractionProgress {
  stage: ExtractionStage;
  done: number;
  total: number;
}

export interface ExtractionHooks {
  onProgress: (progress: ExtractionProgress) => void;
  /** Annulation (extraction supprimée ou expirée) : les processus lancés sont arrêtés. */
  signal: AbortSignal;
}

/** Document refusé à la réception (400) : type, taille, PDF protégé ou illisible. */
export class DocumentRejectedError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentRejectedError';
  }
}

/**
 * Échec de lecture pendant le traitement en tâche de fond. `userMessage` est un texte
 * français sûr (jamais un extrait du document) que l'API renvoie tel quel.
 */
export class DocumentExtractionError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
    this.name = 'DocumentExtractionError';
  }
}

/**
 * Port (driven side) : transforme un document (PDF ou image) en texte, page par page,
 * par lecture de la couche texte ou par OCR. L'adaptateur ne conserve jamais le document.
 */
export abstract class DocumentTextExtractor {
  abstract capabilities(): Promise<ExtractionCapabilities>;
  /** Vérifie le type sur les octets et, pour un PDF, qu'il est lisible, non protégé et assez court. */
  abstract inspect(file: Buffer): Promise<DocumentInfo>;
  abstract extract(
    file: Buffer,
    info: DocumentInfo,
    hooks: ExtractionHooks,
  ): Promise<DocumentText>;
}
