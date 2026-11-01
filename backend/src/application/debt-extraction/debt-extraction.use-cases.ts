import { Injectable } from '@nestjs/common';
import { ExtractionCapabilities } from '../../domain/contract-extraction/document-text-extractor';
import {
  DebtExtractionJobs,
  ExtractionJobView,
  StartedExtraction,
} from './debt-extraction.jobs';

@Injectable()
export class GetExtractionCapabilitiesUseCase {
  constructor(private readonly jobs: DebtExtractionJobs) {}

  execute(): Promise<ExtractionCapabilities> {
    return this.jobs.capabilities();
  }
}

@Injectable()
export class StartDebtExtractionUseCase {
  constructor(private readonly jobs: DebtExtractionJobs) {}

  execute(
    userId: string,
    spaceId: string,
    file: Buffer | undefined,
  ): Promise<StartedExtraction> {
    return this.jobs.start(userId, spaceId, file);
  }
}

@Injectable()
export class GetDebtExtractionUseCase {
  constructor(private readonly jobs: DebtExtractionJobs) {}

  execute(userId: string, jobId: string): ExtractionJobView {
    return this.jobs.get(userId, jobId);
  }
}

@Injectable()
export class DeleteDebtExtractionUseCase {
  constructor(private readonly jobs: DebtExtractionJobs) {}

  execute(userId: string, jobId: string): void {
    this.jobs.delete(userId, jobId);
  }
}
