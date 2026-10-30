import { Injectable, NotFoundException } from '@nestjs/common';
import {
  HouseholdRepository,
  HouseholdSnapshot,
} from '../../domain/household/household.repository';
import { Space, isVisibleTo } from '../../domain/space/space';

/**
 * Point unique de controle d'acces aux espaces : un espace qui n'est pas visible
 * pour l'utilisateur est traite comme inexistant (404), jamais comme interdit.
 */
@Injectable()
export class SpaceAccessService {
  constructor(private readonly households: HouseholdRepository) {}

  async requireSnapshot(userId: string): Promise<HouseholdSnapshot> {
    const snapshot = await this.households.findSnapshotByUserId(userId);
    if (!snapshot) {
      throw new NotFoundException('Aucun foyer');
    }
    return snapshot;
  }

  async requireSpace(userId: string, spaceId: string): Promise<Space> {
    const snapshot = await this.requireSnapshot(userId);
    const space = snapshot.spaces.find((s) => s.id === spaceId);
    if (!space || !isVisibleTo(space, userId)) {
      throw new NotFoundException('Espace introuvable');
    }
    return space;
  }
}
