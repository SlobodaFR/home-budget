/**
 * Lit un élément par son index en rendant l'absence explicite dans le type :
 * sans `noUncheckedIndexedAccess`, `items[i]` est typé comme toujours présent
 * alors qu'un index hors bornes (ou un groupe de regex non capturé) donne
 * `undefined` à l'exécution.
 */
export function at<T>(items: ArrayLike<T>, index: number): T | undefined {
  return items[index];
}
