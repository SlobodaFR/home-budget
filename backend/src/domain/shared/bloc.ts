/**
 * Les quatre blocs du budget (cadre du cours de finances familiales) :
 * FIXE (contrats), COURANT (necessaire mais variable), PLAISIR, EPARGNE.
 */
export const BLOCS = ['FIXE', 'COURANT', 'PLAISIR', 'EPARGNE'] as const;
export type Bloc = (typeof BLOCS)[number];

export function isBloc(value: unknown): value is Bloc {
  return (
    typeof value === 'string' && (BLOCS as readonly string[]).includes(value)
  );
}
