import { Injectable } from '@nestjs/common';
import { SafetyNet, SafetyNetProps } from '../../domain/safety-net/safety-net';
import { SafetyNetRepository } from '../../domain/safety-net/safety-net.repository';
import { SafetyNetProgress } from '../../domain/safety-net/safety-net-coverage';
import { SpaceAccessService } from '../household/space-access.service';
import { SafetyNetProgressService } from './safety-net-progress.service';

export interface SafetyNetDto {
  /** Montant BRUT déclaré (jamais ajusté). */
  safetyNet: SafetyNetProps | null;
  progress: SafetyNetProgress | null;
}

/** Épargne de sécurité du foyer ; n'importe quel membre peut la lire et la modifier. */
@Injectable()
export class GetSafetyNetUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly safetyNets: SafetyNetRepository,
    private readonly progress: SafetyNetProgressService,
  ) {}

  async execute(userId: string): Promise<SafetyNetDto> {
    const snapshot = await this.access.requireSnapshot(userId);
    const safetyNet = await this.safetyNets.find(snapshot.household.id);
    if (!safetyNet) {
      return { safetyNet: null, progress: null };
    }
    const common = snapshot.spaces.find((s) => s.kind === 'COMMON')!;
    return {
      safetyNet: safetyNet.toProps(),
      progress: await this.progress.compute(common.id, safetyNet),
    };
  }
}

@Injectable()
export class SaveSafetyNetUseCase {
  constructor(
    private readonly access: SpaceAccessService,
    private readonly safetyNets: SafetyNetRepository,
  ) {}

  async execute(userId: string, props: SafetyNetProps): Promise<void> {
    const snapshot = await this.access.requireSnapshot(userId);
    await this.safetyNets.save(snapshot.household.id, SafetyNet.create(props));
  }
}
