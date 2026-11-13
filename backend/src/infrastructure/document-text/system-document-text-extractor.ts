import { writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import {
  DocumentKind,
  detectDocumentKind,
  readImageSize,
} from '../../domain/contract-extraction/document-kind';
import {
  DocumentExtractionError,
  DocumentInfo,
  DocumentRejectedError,
  DocumentText,
  DocumentTextExtractor,
  ExtractionCapabilities,
  ExtractionHooks,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
} from '../../domain/contract-extraction/document-text-extractor';
import { CommandError, CommandOptions, CommandRunner } from './command-runner';
import { OcrEngine } from './ocr-engine';
import { withWorkDir } from './work-dir';

export interface SystemExtractorConfig {
  maxFileBytes: number;
  maxPages: number;
  /** Délai d'un appel à un outil. */
  callTimeoutMs: number;
  /** Délai de l'extraction entière. */
  totalTimeoutMs: number;
  /** En dessous (caractères utiles par page, en moyenne), le PDF est traité comme un scan. */
  minCharsPerPage: number;
  /** Résolution de rastérisation des pages d'un scan. */
  dpi: number;
  /** Plafond de pixels d'une image ou d'une page rastérisée. */
  maxPixels: number;
  /** Plafond de la sortie texte d'un outil. */
  maxOutputBytes: number;
  /** Dossier parent des dossiers temporaires (par défaut : celui du système). */
  tempRoot?: string;
}

export const DEFAULT_EXTRACTOR_CONFIG: SystemExtractorConfig = {
  maxFileBytes: MAX_DOCUMENT_BYTES,
  maxPages: MAX_DOCUMENT_PAGES,
  callTimeoutMs: 60_000,
  totalTimeoutMs: 180_000,
  minCharsPerPage: 200,
  dpi: 200,
  maxPixels: 40_000_000,
  maxOutputBytes: 4 * 1024 * 1024,
};

const DETECTION_TIMEOUT_MS = 8_000;
const FILE_NAME: Record<DocumentKind, string> = {
  PDF: 'document.pdf',
  PNG: 'document.png',
  JPEG: 'document.jpg',
};

function usefulChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/**
 * Adaptateur système : `pdfinfo` / `pdftotext` / `pdftoppm` (poppler) et un moteur d'OCR.
 * Toujours un tableau d'arguments (aucun shell), des noms de fichiers générés, un
 * environnement minimal, des délais par appel et global, un dossier temporaire privé
 * supprimé quoi qu'il arrive. Rien du contenu ni du nom du fichier n'est journalisé ici.
 */
export class SystemDocumentTextExtractor extends DocumentTextExtractor {
  private capabilitiesPromise: Promise<ExtractionCapabilities> | null = null;

  constructor(
    private readonly runner: CommandRunner,
    private readonly engine: OcrEngine,
    private readonly config: SystemExtractorConfig = DEFAULT_EXTRACTOR_CONFIG,
  ) {
    super();
  }

  capabilities(): Promise<ExtractionCapabilities> {
    // Détection une seule fois : les outils ne changent pas pendant la vie du processus.
    this.capabilitiesPromise ??= this.detect();
    return this.capabilitiesPromise;
  }

  private async detect(): Promise<ExtractionCapabilities> {
    const limits = {
      maxFileBytes: this.config.maxFileBytes,
      maxPages: this.config.maxPages,
    };
    try {
      return await withWorkDir(async (dir) => {
        const options = this.options(dir, DETECTION_TIMEOUT_MS);
        for (const tool of ['pdfinfo', 'pdftotext', 'pdftoppm']) {
          await this.runner.run(tool, ['-v'], options);
        }
        const engineReady = await this.engine.isAvailable(this.runner, options);
        return {
          available: engineReady,
          engines: engineReady ? [this.engine.name] : [],
          ...limits,
        };
      }, this.config.tempRoot);
    } catch {
      return { available: false, engines: [], ...limits };
    }
  }

  async inspect(file: Buffer): Promise<DocumentInfo> {
    if (file.length === 0) {
      throw new DocumentRejectedError('Le fichier est vide.');
    }
    if (file.length > this.config.maxFileBytes) {
      throw new DocumentRejectedError(
        `Le fichier dépasse la taille maximale de ${Math.floor(this.config.maxFileBytes / (1024 * 1024))} Mo.`,
      );
    }
    const kind = detectDocumentKind(file);
    if (!kind) {
      throw new DocumentRejectedError(
        'Format non pris en charge : envoyez un PDF, un PNG ou un JPEG.',
      );
    }
    if (kind !== 'PDF') {
      const size = readImageSize(file, kind);
      if (!size || size.width < 1 || size.height < 1) {
        throw new DocumentRejectedError("L'image est illisible.");
      }
      if (size.width * size.height > this.config.maxPixels) {
        throw new DocumentRejectedError(
          "L'image est trop grande : réduisez sa définition (40 mégapixels au plus).",
        );
      }
      return { kind, pages: 1 };
    }
    return withWorkDir(async (dir) => {
      await writeFile(join(dir, FILE_NAME.PDF), file, { mode: 0o600 });
      return this.inspectPdf(dir);
    }, this.config.tempRoot);
  }

  private async inspectPdf(dir: string): Promise<DocumentInfo> {
    let stdout: string;
    try {
      ({ stdout } = await this.runner.run(
        'pdfinfo',
        [FILE_NAME.PDF],
        this.options(dir, this.config.callTimeoutMs),
      ));
    } catch (error) {
      if (error instanceof CommandError && error.failure === 'EXIT') {
        throw new DocumentRejectedError(
          /password/i.test(error.stderr)
            ? 'Ce PDF est protégé par un mot de passe : retirez la protection puis réessayez.'
            : 'Ce PDF est illisible ou endommagé.',
        );
      }
      throw this.unavailable(error);
    }
    const pages = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (!Number.isInteger(pages) || pages < 1) {
      throw new DocumentRejectedError('Ce PDF est illisible ou endommagé.');
    }
    if (pages > this.config.maxPages) {
      throw new DocumentRejectedError(
        `Ce PDF compte ${pages} pages : la limite est de ${this.config.maxPages}.`,
      );
    }
    const dimensions = /^Page size:\s+([\d.]+) x ([\d.]+) pts/m.exec(stdout);
    if (dimensions) {
      const pixels =
        ((Number(dimensions[1]) * this.config.dpi) / 72) *
        ((Number(dimensions[2]) * this.config.dpi) / 72);
      if (pixels > this.config.maxPixels) {
        throw new DocumentRejectedError(
          'Les pages de ce PDF sont de dimensions démesurées.',
        );
      }
    }
    return { kind: 'PDF', pages };
  }

  async extract(
    file: Buffer,
    info: DocumentInfo,
    hooks: ExtractionHooks,
  ): Promise<DocumentText> {
    // Délai global : un seul contrôleur d'annulation pour l'appelant et pour le délai.
    const controller = new AbortController();
    const timeout = { fired: false };
    const total = setTimeout(() => {
      timeout.fired = true;
      controller.abort();
    }, this.config.totalTimeoutMs);
    total.unref();
    const forward = () => controller.abort();
    hooks.signal.addEventListener('abort', forward, { once: true });
    if (hooks.signal.aborted) {
      controller.abort();
    }
    try {
      return await withWorkDir(
        (dir) =>
          info.kind === 'PDF'
            ? this.extractPdf(dir, file, info, hooks, controller.signal)
            : this.extractImage(dir, file, info.kind, hooks, controller.signal),
        this.config.tempRoot,
      );
    } catch (error) {
      if (timeout.fired) {
        throw new DocumentExtractionError(
          'Le traitement du document a pris trop de temps : essayez avec un document plus court ou un scan moins lourd.',
        );
      }
      throw error;
    } finally {
      clearTimeout(total);
      hooks.signal.removeEventListener('abort', forward);
    }
  }

  private async extractPdf(
    dir: string,
    file: Buffer,
    info: DocumentInfo,
    hooks: ExtractionHooks,
    signal: AbortSignal,
  ): Promise<DocumentText> {
    await writeFile(join(dir, FILE_NAME.PDF), file, { mode: 0o600 });
    hooks.onProgress({ stage: 'TEXT', done: 0, total: info.pages });
    const layer = await this.readTextLayer(dir, info.pages, signal);
    const layerChars = layer.reduce((sum, page) => sum + usefulChars(page), 0);
    hooks.onProgress({ stage: 'TEXT', done: info.pages, total: info.pages });
    if (layerChars / info.pages >= this.config.minCharsPerPage) {
      return { source: 'TEXT_LAYER', engine: null, pages: layer };
    }

    const images = await this.rasterize(dir, info.pages, signal);
    const pages: string[] = [];
    hooks.onProgress({ stage: 'OCR', done: 0, total: images.length });
    for (const [index, image] of images.entries()) {
      pages.push(await this.recognize(dir, image, signal));
      hooks.onProgress({
        stage: 'OCR',
        done: index + 1,
        total: images.length,
      });
    }
    const ocrChars = pages.reduce((sum, page) => sum + usefulChars(page), 0);
    // Un PDF presque sans couche texte mais dont l'OCR ne donne rien de plus : on garde la couche texte.
    if (ocrChars < layerChars) {
      return { source: 'TEXT_LAYER', engine: null, pages: layer };
    }
    return { source: 'OCR', engine: this.engine.name, pages };
  }

  private async readTextLayer(
    dir: string,
    pageCount: number,
    signal: AbortSignal,
  ): Promise<string[]> {
    try {
      const { stdout } = await this.runner.run(
        'pdftotext',
        [
          '-layout',
          '-enc',
          'UTF-8',
          '-f',
          '1',
          '-l',
          String(pageCount),
          FILE_NAME.PDF,
          '-',
        ],
        this.options(dir, this.config.callTimeoutMs, signal),
      );
      const pages = stdout.split('\f');
      if (pages.length > pageCount) {
        pages.length = pageCount;
      }
      while (pages.length < pageCount) {
        pages.push('');
      }
      return pages;
    } catch (error) {
      // Extraction de texte interdite par le PDF ou texte illisible : on passe à l'OCR.
      if (error instanceof CommandError && error.failure === 'EXIT') {
        return Array.from({ length: pageCount }, () => '');
      }
      throw this.unavailable(error);
    }
  }

  private async rasterize(
    dir: string,
    pageCount: number,
    signal: AbortSignal,
  ): Promise<string[]> {
    try {
      await this.runner.run(
        'pdftoppm',
        [
          '-r',
          String(this.config.dpi),
          '-png',
          '-f',
          '1',
          '-l',
          String(pageCount),
          FILE_NAME.PDF,
          'page',
        ],
        this.options(dir, this.config.callTimeoutMs * 2, signal),
      );
    } catch (error) {
      throw this.unavailable(error);
    }
    // Noms produits par pdftoppm lui-même (page-1.png, page-01.png…), triés par numéro de page.
    const names = (await readdir(dir))
      .filter((name) => /^page-\d+\.png$/.test(name))
      .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));
    if (names.length === 0) {
      throw new DocumentExtractionError(
        'Impossible de lire les pages de ce document : il est peut-être endommagé.',
      );
    }
    return names;
  }

  private async extractImage(
    dir: string,
    file: Buffer,
    kind: DocumentKind,
    hooks: ExtractionHooks,
    signal: AbortSignal,
  ): Promise<DocumentText> {
    const name = FILE_NAME[kind];
    await writeFile(join(dir, name), file, { mode: 0o600 });
    hooks.onProgress({ stage: 'OCR', done: 0, total: 1 });
    const text = await this.recognize(dir, name, signal);
    hooks.onProgress({ stage: 'OCR', done: 1, total: 1 });
    return { source: 'OCR', engine: this.engine.name, pages: [text] };
  }

  private async recognize(
    dir: string,
    imageName: string,
    signal: AbortSignal,
  ): Promise<string> {
    try {
      return await this.engine.recognize(
        imageName,
        this.runner,
        this.options(dir, this.config.callTimeoutMs, signal),
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  /** Erreur d'outil → erreur à message français sûr ; annulation et erreurs inconnues restent telles quelles. */
  private unavailable(error: unknown): Error {
    if (error instanceof CommandError) {
      switch (error.failure) {
        case 'TIMEOUT':
          return new DocumentExtractionError(
            'Le traitement du document a pris trop de temps : essayez avec un scan moins lourd.',
          );
        case 'OUTPUT_TOO_LARGE':
          return new DocumentExtractionError(
            'Le texte lu dans ce document est démesuré : il n’a pas pu être traité.',
          );
        case 'ABORTED':
        // Outil hors liste blanche : bug de programmation, pas un problème de document.
        case 'NOT_ALLOWED':
          return error;
        default:
          return new DocumentExtractionError(
            'La lecture du document a échoué : essayez avec un document plus net.',
          );
      }
    }
    return error instanceof Error ? error : new Error('Erreur inconnue');
  }

  /** Environnement minimal : ni les secrets ni la configuration du serveur ne passent aux outils. */
  private options(
    dir: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): CommandOptions {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: dir,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      OMP_THREAD_LIMIT: '1',
    };
    if (process.env.TESSDATA_PREFIX) {
      env.TESSDATA_PREFIX = process.env.TESSDATA_PREFIX;
    }
    return {
      cwd: dir,
      env,
      timeoutMs,
      maxOutputBytes: this.config.maxOutputBytes,
      signal,
    };
  }
}
