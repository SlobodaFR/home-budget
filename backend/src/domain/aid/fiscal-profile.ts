import { DomainError } from '../shared/domain-error';

export const MAX_CHILDREN = 10;

export interface FiscalProfileProps {
  /** Enfants de moins de 6 ans au 1er janvier, gardés hors du domicile. */
  childrenUnderSix: number;
  /** Enfants à charge. */
  dependentChildren: number;
  /** Première année de recours à l'emploi à domicile (plafond relevé). */
  firstYearHomeServices: boolean;
}

/** Paramètres du foyer fiscal nécessaires aux plafonds des aides. */
export class FiscalProfile {
  private constructor(private readonly props: FiscalProfileProps) {
    for (const [field, label] of [
      ['childrenUnderSix', "Le nombre d'enfants de moins de 6 ans"],
      ['dependentChildren', "Le nombre d'enfants à charge"],
    ] as const) {
      const value = props[field];
      if (!Number.isInteger(value) || value < 0 || value > MAX_CHILDREN) {
        throw new DomainError(
          `${label} doit être un entier de 0 à ${MAX_CHILDREN}`,
        );
      }
    }
    if (typeof props.firstYearHomeServices !== 'boolean') {
      throw new DomainError(
        "La première année d'emploi à domicile doit être vrai ou faux",
      );
    }
  }

  static create(props: FiscalProfileProps): FiscalProfile {
    return new FiscalProfile({ ...props });
  }

  /** Profil par défaut quand rien n'est déclaré : aucun enfant, pas de première année. */
  static none(): FiscalProfile {
    return new FiscalProfile({
      childrenUnderSix: 0,
      dependentChildren: 0,
      firstYearHomeServices: false,
    });
  }

  get childrenUnderSix(): number {
    return this.props.childrenUnderSix;
  }

  get dependentChildren(): number {
    return this.props.dependentChildren;
  }

  get firstYearHomeServices(): boolean {
    return this.props.firstYearHomeServices;
  }

  toProps(): FiscalProfileProps {
    return { ...this.props };
  }
}
