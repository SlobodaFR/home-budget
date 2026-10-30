export type ContributionMode = 'EQUAL' | 'PROPORTIONAL' | 'EQUAL_REMAINDER';
export type SpaceKind = 'COMMON' | 'PERSONAL';
export type MemberRole = 'OWNER' | 'MEMBER';

export const MAX_HOUSEHOLD_MEMBERS = 4;

export interface Member {
  userId: string;
  name: string;
  role: MemberRole;
  netMonthlyIncomeCents: number | null;
}

export interface Space {
  id: string;
  kind: SpaceKind;
  name: string;
}

export interface Household {
  id: string;
  name: string;
  role: MemberRole;
  contributionMode: ContributionMode;
  members: Member[];
  spaces: Space[];
}

export interface ContributionShare {
  userId: string;
  name: string;
  incomeCents: number | null;
  contributionCents: number;
  remainingCents: number;
}

export interface Contribution {
  mode: ContributionMode;
  commonNeedCents: number;
  incomplete: boolean;
  shortfallCents: number;
  shares: ContributionShare[];
}

export interface Invitation {
  code: string;
  expiresAt: string;
}

export const CONTRIBUTION_MODES: readonly ContributionMode[] = ['EQUAL', 'PROPORTIONAL', 'EQUAL_REMAINDER'];

export const CONTRIBUTION_MODE_INFO: Record<ContributionMode, { label: string; description: string }> = {
  EQUAL: { label: 'Moitié-moitié', description: 'Chacun verse la même somme pour le commun.' },
  PROPORTIONAL: {
    label: 'Au prorata des revenus',
    description: 'Chacun verse une part du commun proportionnelle à ce qu’il gagne.',
  },
  EQUAL_REMAINDER: {
    label: 'Même reste pour chacun',
    description: 'Chacun verse ce qu’il faut pour qu’il reste autant à tous une fois le commun financé.',
  },
};

export function findSpace(household: Household, kind: SpaceKind): Space | undefined {
  return household.spaces.find((space) => space.kind === kind);
}

export function membersMissingIncome(household: Household): Member[] {
  return household.members.filter((member) => member.netMonthlyIncomeCents === null);
}
