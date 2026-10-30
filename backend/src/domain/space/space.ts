import { DomainError } from '../shared/domain-error';

export type SpaceKind = 'COMMON' | 'PERSONAL';

export interface SpaceProps {
  id: string;
  householdId: string;
  kind: SpaceKind;
  /** Proprietaire d'un espace personnel ; null pour l'espace commun. */
  ownerUserId: string | null;
  name: string;
}

/**
 * Un espace porte un plan et des operations. Le commun est visible par tous les
 * membres du foyer ; un espace personnel par son seul proprietaire.
 */
export class Space {
  private constructor(private readonly props: SpaceProps) {
    if (props.kind === 'PERSONAL' && !props.ownerUserId) {
      throw new DomainError('Un espace personnel doit avoir un proprietaire');
    }
    if (props.kind === 'COMMON' && props.ownerUserId) {
      throw new DomainError("L'espace commun n'a pas de proprietaire");
    }
  }

  static create(props: SpaceProps): Space {
    return new Space(props);
  }

  get id(): string {
    return this.props.id;
  }

  get householdId(): string {
    return this.props.householdId;
  }

  get kind(): SpaceKind {
    return this.props.kind;
  }

  get ownerUserId(): string | null {
    return this.props.ownerUserId;
  }

  get name(): string {
    return this.props.name;
  }

  isPersonal(): boolean {
    return this.props.kind === 'PERSONAL';
  }
}

/** Regle d'acces unique : l'espace de quelqu'un d'autre n'existe pas pour moi. */
export function isVisibleTo(space: Space, userId: string): boolean {
  return space.kind === 'COMMON' || space.ownerUserId === userId;
}
