import { Space } from '../space/space';
import { Household } from './household';
import { Invitation } from './invitation';
import { Membership } from './membership';

/**
 * Vue complete d'un foyer. `spaces` contient TOUS les espaces : la couche
 * application filtre avec `isVisibleTo` avant de repondre.
 */
export interface HouseholdSnapshot {
  household: Household;
  memberships: Membership[];
  spaces: Space[];
}

/** Port (driven side). Les methodes composees sont atomiques. */
export abstract class HouseholdRepository {
  abstract findSnapshotByUserId(
    userId: string,
  ): Promise<HouseholdSnapshot | null>;
  abstract findSnapshotByHouseholdId(
    householdId: string,
  ): Promise<HouseholdSnapshot | null>;
  abstract createHousehold(
    household: Household,
    ownerMembership: Membership,
    spaces: Space[],
  ): Promise<void>;
  abstract saveHousehold(household: Household): Promise<void>;
  abstract saveMembership(membership: Membership): Promise<void>;
  abstract saveInvitation(invitation: Invitation): Promise<void>;
  abstract findInvitationByCode(code: string): Promise<Invitation | null>;
  /** Ajoute le membre, cree son espace personnel et consomme l'invitation, en une transaction. */
  abstract join(
    consumedInvitation: Invitation,
    membership: Membership,
    personalSpace: Space,
  ): Promise<void>;
}
