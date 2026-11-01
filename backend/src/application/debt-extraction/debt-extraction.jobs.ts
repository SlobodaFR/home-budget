import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extractContractFields } from '../../domain/contract-extraction/contract-extractor';
import {
  DocumentExtractionError,
  DocumentInfo,
  DocumentTextExtractor,
  ExtractionCapabilities,
  ExtractionProgress,
  MAX_DOCUMENT_BYTES,
} from '../../domain/contract-extraction/document-text-extractor';
import { detectDocumentKind } from '../../domain/contract-extraction/document-kind';
import { ExtractedField } from '../../domain/contract-extraction/extraction.types';
import { Clock } from '../../domain/shared/clock';
import { DomainError } from '../../domain/shared/domain-error';
import { SpaceAccessService } from '../household/space-access.service';

/** Durée de conservation d'une extraction (et de son résultat) en mémoire. */
export const EXTRACTION_TTL_MS = 15 * 60 * 1000;
/** Quota par utilisateur sur une heure glissante. */
export const MAX_EXTRACTIONS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 30 * 1000;

export type ExtractionJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type ExtractionJobStage = 'TEXT' | 'OCR' | 'PARSING';

export interface ExtractionResultView {
  source: 'TEXT_LAYER' | 'OCR';
  pages: number;
  engine: 'tesseract' | 'ocrs' | null;
  fields: ExtractedField[];
  warnings: string[];
}

export interface ExtractionJobView {
  status: ExtractionJobStatus;
  stage: ExtractionJobStage | null;
  progressPercent: number;
  result?: ExtractionResultView;
  error?: { message: string };
}

export interface StartedExtraction {
  jobId: string;
  expiresAt: string;
}

export const GENERIC_FAILURE_MESSAGE =
  "L'extraction a échoué : essayez avec un document plus net ou saisissez les informations à la main.";

interface Job {
  id: string;
  userId: string;
  status: ExtractionJobStatus;
  stage: ExtractionJobStage | null;
  progressPercent: number;
  result?: ExtractionResultView;
  error?: { message: string };
  expiresAt: number;
  /** Le document n'est gardé que jusqu'à la fin du traitement. */
  file: Buffer | null;
  info: DocumentInfo;
  sizeBytes: number;
  abort: AbortController;
}

function tooManyRequests(message: string): HttpException {
  return new HttpException(
    { statusCode: 429, message, error: 'Too Many Requests' },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Extractions en mémoire : une file globale à concurrence 1 (CPU du serveur), une seule
 * extraction à la fois par utilisateur, 5 par heure et par utilisateur, résultats purgés
 * au bout de 15 minutes (horloge injectée). Journal : identifiant, taille, durée, étapes —
 * jamais le contenu ni le nom du fichier.
 */
@Injectable()
export class DebtExtractionJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('DebtExtraction');
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private readonly starts = new Map<string, number[]>();
  private current: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly extractor: DocumentTextExtractor,
    private readonly access: SpaceAccessService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.purgeExpired(), PURGE_INTERVAL_MS);
    // Le minuteur ne doit jamais retenir le processus à l'arrêt.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const job of this.jobs.values()) {
      job.abort.abort();
      job.file = null;
    }
    this.jobs.clear();
    this.queue.length = 0;
  }

  capabilities(): Promise<ExtractionCapabilities> {
    return this.extractor.capabilities();
  }

  async start(
    userId: string,
    spaceId: string,
    file: Buffer | undefined,
  ): Promise<StartedExtraction> {
    this.purgeExpired();
    const capabilities = await this.extractor.capabilities();
    if (!capabilities.available) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'OCR_UNAVAILABLE',
        message:
          "L'import de contrat n'est pas disponible sur ce serveur (outils de lecture absents).",
      });
    }
    // Mêmes droits que la création d'un crédit : un espace invisible est inexistant (404).
    await this.access.requireSpace(userId, spaceId);

    if (!file || file.length === 0) {
      throw new DomainError(
        'Aucun fichier reçu : envoyez un PDF, un PNG ou un JPEG (champ « file »).',
      );
    }
    if (file.length > MAX_DOCUMENT_BYTES) {
      throw new DomainError('Le fichier dépasse la taille maximale de 10 Mo.');
    }
    if (!detectDocumentKind(file)) {
      throw new DomainError(
        'Format non pris en charge : envoyez un PDF, un PNG ou un JPEG.',
      );
    }
    this.assertCanStart(userId);
    const info = await this.extractor.inspect(file);
    // Pendant l'inspection, une autre requête du même utilisateur a pu passer : on revérifie.
    this.assertCanStart(userId);

    const now = this.clock.now().getTime();
    const job: Job = {
      id: randomUUID(),
      userId,
      status: 'PENDING',
      stage: null,
      progressPercent: 0,
      expiresAt: now + EXTRACTION_TTL_MS,
      file,
      info,
      sizeBytes: file.length,
      abort: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.starts.set(userId, [...(this.starts.get(userId) ?? []), now]);
    this.logger.log(
      `job=${job.id} reçu taille=${job.sizeBytes}o type=${info.kind} pages=${info.pages}`,
    );
    this.pump();
    return { jobId: job.id, expiresAt: new Date(job.expiresAt).toISOString() };
  }

  get(userId: string, jobId: string): ExtractionJobView {
    this.purgeExpired();
    const job = this.owned(userId, jobId);
    return {
      status: job.status,
      stage: job.stage,
      progressPercent: job.progressPercent,
      ...(job.result ? { result: job.result } : {}),
      ...(job.error ? { error: job.error } : {}),
    };
  }

  delete(userId: string, jobId: string): void {
    this.purgeExpired();
    const job = this.owned(userId, jobId);
    this.remove(job);
    this.logger.log(`job=${job.id} supprimé`);
  }

  /** Attend la fin du traitement en cours (tests). */
  async idle(): Promise<void> {
    while (this.current) {
      await this.current;
    }
  }

  /** Retire les extractions expirées et les entrées de quota de plus d'une heure. */
  purgeExpired(): void {
    const now = this.clock.now().getTime();
    for (const job of [...this.jobs.values()]) {
      if (job.expiresAt <= now) {
        this.remove(job);
        this.logger.log(`job=${job.id} expiré`);
      }
    }
    for (const [userId, times] of this.starts) {
      const recent = times.filter((time) => now - time < HOUR_MS);
      if (recent.length === 0) {
        this.starts.delete(userId);
      } else if (recent.length !== times.length) {
        this.starts.set(userId, recent);
      }
    }
  }

  private owned(userId: string, jobId: string): Job {
    const job = this.jobs.get(jobId);
    // Un résultat d'un autre utilisateur est traité comme inexistant.
    if (!job || job.userId !== userId) {
      throw new NotFoundException('Extraction introuvable');
    }
    return job;
  }

  private assertCanStart(userId: string): void {
    const now = this.clock.now().getTime();
    for (const job of this.jobs.values()) {
      if (
        job.userId === userId &&
        (job.status === 'PENDING' || job.status === 'RUNNING')
      ) {
        throw tooManyRequests(
          'Une extraction est déjà en cours : attendez la fin de la lecture du document précédent.',
        );
      }
    }
    const recent = (this.starts.get(userId) ?? []).filter(
      (time) => now - time < HOUR_MS,
    );
    if (recent.length >= MAX_EXTRACTIONS_PER_HOUR) {
      throw tooManyRequests(
        `Limite atteinte : ${MAX_EXTRACTIONS_PER_HOUR} extractions par heure. Réessayez plus tard ou saisissez les informations à la main.`,
      );
    }
  }

  private remove(job: Job): void {
    job.abort.abort();
    job.file = null;
    this.jobs.delete(job.id);
    const queued = this.queue.indexOf(job);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
    }
  }

  private pump(): void {
    if (this.current) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }
    const run = this.run(job).finally(() => {
      this.current = null;
      this.pump();
    });
    this.current = run;
  }

  private async run(job: Job): Promise<void> {
    const startedAt = Date.now();
    job.status = 'RUNNING';
    job.stage = 'TEXT';
    job.progressPercent = 2;
    this.logger.log(`job=${job.id} démarré`);
    try {
      const file = job.file;
      if (!file) {
        return;
      }
      const text = await this.extractor.extract(file, job.info, {
        signal: job.abort.signal,
        onProgress: (progress) => this.onProgress(job, progress),
      });
      if (!this.jobs.has(job.id)) {
        return;
      }
      job.stage = 'PARSING';
      job.progressPercent = 95;
      this.logger.log(`job=${job.id} étape=PARSING`);
      const extraction = extractContractFields(text.pages);
      job.result = {
        source: text.source,
        pages: text.pages.length,
        engine: text.engine,
        fields: extraction.fields,
        warnings: extraction.warnings,
      };
      job.status = 'DONE';
      job.progressPercent = 100;
      this.logger.log(
        `job=${job.id} terminé source=${text.source} champs=${extraction.fields.length} durée=${Date.now() - startedAt}ms`,
      );
    } catch (error) {
      if (!this.jobs.has(job.id)) {
        return; // supprimé ou expiré pendant le traitement : plus personne n'attend le résultat
      }
      job.status = 'FAILED';
      job.error = {
        message:
          error instanceof DocumentExtractionError
            ? error.userMessage
            : GENERIC_FAILURE_MESSAGE,
      };
      // Le nom de la classe d'erreur suffit : le message d'un outil pourrait citer le document.
      this.logger.warn(
        `job=${job.id} échec=${error instanceof Error ? error.name : 'inconnu'} durée=${Date.now() - startedAt}ms`,
      );
    } finally {
      job.stage = null;
      job.file = null;
    }
  }

  private onProgress(job: Job, progress: ExtractionProgress): void {
    if (!this.jobs.has(job.id)) {
      return;
    }
    const ratio =
      progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
    if (job.stage !== progress.stage) {
      this.logger.log(`job=${job.id} étape=${progress.stage}`);
    }
    job.stage = progress.stage;
    job.progressPercent =
      progress.stage === 'TEXT'
        ? Math.round(2 + ratio * 8)
        : Math.round(10 + ratio * 82);
  }
}
