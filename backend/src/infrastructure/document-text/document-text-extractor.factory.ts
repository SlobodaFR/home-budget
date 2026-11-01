import { Logger } from '@nestjs/common';
import { DocumentTextExtractor } from '../../domain/contract-extraction/document-text-extractor';
import { ProcessCommandRunner } from './command-runner';
import { OcrEngine, TesseractOcrEngine } from './ocr-engine';
import { SystemDocumentTextExtractor } from './system-document-text-extractor';

export interface OcrEnvironment {
  /** `OCR_ENGINE` : `tesseract` (défaut). */
  OCR_ENGINE?: string;
  /** `OCR_LANG` : langue(s) tesseract, `fra` par défaut (`fra+eng` accepté). */
  OCR_LANG?: string;
}

export const DEFAULT_OCR_ENGINE = 'tesseract';
export const DEFAULT_OCR_LANG = 'fra';

/** Construit l'adaptateur système à partir de `OCR_ENGINE` et `OCR_LANG` (valeurs invalides : défaut + avertissement). */
export function createSystemDocumentTextExtractor(
  env: OcrEnvironment,
  logger = new Logger('DebtExtraction'),
): DocumentTextExtractor {
  const requested = (env.OCR_ENGINE ?? DEFAULT_OCR_ENGINE).trim().toLowerCase();
  if (requested !== DEFAULT_OCR_ENGINE) {
    logger.warn(
      `OCR_ENGINE="${requested}" inconnu : utilisation de "${DEFAULT_OCR_ENGINE}".`,
    );
  }
  let engine: OcrEngine;
  try {
    engine = new TesseractOcrEngine((env.OCR_LANG ?? DEFAULT_OCR_LANG).trim());
  } catch {
    logger.warn(`OCR_LANG invalide : utilisation de "${DEFAULT_OCR_LANG}".`);
    engine = new TesseractOcrEngine(DEFAULT_OCR_LANG);
  }
  return new SystemDocumentTextExtractor(new ProcessCommandRunner(), engine);
}
