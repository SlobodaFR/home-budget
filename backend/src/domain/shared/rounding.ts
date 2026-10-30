/**
 * Division entière arrondie à l'entier le plus proche (0,5 vers le haut) pour
 * des entiers positifs : évite toute dérive des flottants sur les centimes.
 */
export function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
