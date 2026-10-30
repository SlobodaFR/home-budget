export type Bloc = 'FIXE' | 'COURANT' | 'PLAISIR' | 'EPARGNE';

export const BLOCS: readonly Bloc[] = ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'];

export interface BlocInfo {
  label: string;
  description: string;
}

export const BLOC_INFO: Record<Bloc, BlocInfo> = {
  FIXE: { label: 'Fixe', description: 'Ce qui tombe chaque mois : loyer, assurances, abonnements.' },
  COURANT: { label: 'Courant', description: 'La vie de tous les jours : courses, transports, santé.' },
  PLAISIR: { label: 'Plaisir', description: 'Sorties, loisirs, cadeaux : ce qui fait du bien.' },
  EPARGNE: { label: 'Épargne', description: 'Ce qu’on met de côté pour plus tard.' },
};

export function isBloc(value: unknown): value is Bloc {
  return typeof value === 'string' && (BLOCS as readonly string[]).includes(value);
}
