import { detectDocumentKind } from '../domain/contract-extraction/document-kind';
import {
  DocumentInfo,
  DocumentRejectedError,
  DocumentText,
  DocumentTextExtractor,
  ExtractionCapabilities,
  ExtractionHooks,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
} from '../domain/contract-extraction/document-text-extractor';
import { IMMO_CLEAN } from './contract-fixtures';

/**
 * Faux extracteur de texte : renvoie un contrat fictif sans lancer aucun outil système.
 * Un « portail » (`gate`) permet de garder une extraction en cours pour tester la file.
 */
export class FakeDocumentTextExtractor extends DocumentTextExtractor {
  available = true;
  pages: string[] = [IMMO_CLEAN];
  source: DocumentText['source'] = 'TEXT_LAYER';
  failWith: Error | null = null;
  /** Tant que ce portail est défini, `extract` attend qu'il soit levé. */
  gate: Promise<void> | null = null;
  rejectPdf: string | null = null;
  extractCalls = 0;
  inspectCalls = 0;
  aborted = 0;

  async capabilities(): Promise<ExtractionCapabilities> {
    return {
      available: this.available,
      engines: this.available ? ['tesseract'] : [],
      maxFileBytes: MAX_DOCUMENT_BYTES,
      maxPages: MAX_DOCUMENT_PAGES,
    };
  }

  async inspect(file: Buffer): Promise<DocumentInfo> {
    this.inspectCalls += 1;
    const kind = detectDocumentKind(file);
    if (!kind) {
      throw new DocumentRejectedError(
        'Format non pris en charge : envoyez un PDF, un PNG ou un JPEG.',
      );
    }
    if (kind === 'PDF' && this.rejectPdf) {
      throw new DocumentRejectedError(this.rejectPdf);
    }
    return { kind, pages: this.pages.length };
  }

  async extract(
    _file: Buffer,
    _info: DocumentInfo,
    hooks: ExtractionHooks,
  ): Promise<DocumentText> {
    this.extractCalls += 1;
    hooks.onProgress({ stage: 'OCR', done: 0, total: this.pages.length });
    if (this.gate) {
      await Promise.race([
        this.gate,
        new Promise<void>((_, reject) =>
          hooks.signal.addEventListener('abort', () => {
            this.aborted += 1;
            reject(new Error('annulé'));
          }),
        ),
      ]);
    }
    if (this.failWith) {
      throw this.failWith;
    }
    hooks.onProgress({
      stage: 'OCR',
      done: this.pages.length,
      total: this.pages.length,
    });
    return {
      source: this.source,
      engine: this.source === 'OCR' ? 'tesseract' : null,
      pages: this.pages,
    };
  }
}

/** Un portail et sa clé : `open()` laisse repartir les extractions en attente. */
export function createGate(): { gate: Promise<void>; open: () => void } {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { gate, open };
}
