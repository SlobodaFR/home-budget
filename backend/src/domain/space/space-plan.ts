import { Bloc } from '../shared/bloc';
import { DomainError } from '../shared/domain-error';

export interface SpacePlanProps {
  incomeCents: number;
  fixeCents: number;
  courantCents: number;
  plaisirCents: number;
  epargneCents: number;
}

/** Budget prevu d'un espace pour un mois type : revenus et quatre blocs. */
export class SpacePlan {
  private constructor(private readonly props: SpacePlanProps) {
    for (const [key, value] of Object.entries(props)) {
      if (!Number.isInteger(value) || value < 0) {
        throw new DomainError(`${key} doit etre un entier positif ou nul`);
      }
    }
  }

  static create(props: SpacePlanProps): SpacePlan {
    return new SpacePlan({ ...props });
  }

  static empty(): SpacePlan {
    return new SpacePlan({
      incomeCents: 0,
      fixeCents: 0,
      courantCents: 0,
      plaisirCents: 0,
      epargneCents: 0,
    });
  }

  get incomeCents(): number {
    return this.props.incomeCents;
  }

  get fixeCents(): number {
    return this.props.fixeCents;
  }

  get courantCents(): number {
    return this.props.courantCents;
  }

  get plaisirCents(): number {
    return this.props.plaisirCents;
  }

  get epargneCents(): number {
    return this.props.epargneCents;
  }

  plannedFor(bloc: Bloc): number {
    switch (bloc) {
      case 'FIXE':
        return this.props.fixeCents;
      case 'COURANT':
        return this.props.courantCents;
      case 'PLAISIR':
        return this.props.plaisirCents;
      case 'EPARGNE':
        return this.props.epargneCents;
    }
  }

  get totalBlocsCents(): number {
    return (
      this.props.fixeCents +
      this.props.courantCents +
      this.props.plaisirCents +
      this.props.epargneCents
    );
  }

  get plannedBalanceCents(): number {
    return this.props.incomeCents - this.totalBlocsCents;
  }

  toProps(): SpacePlanProps {
    return { ...this.props };
  }
}
