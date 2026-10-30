/**
 * Division entière arrondie à l'entier le plus proche (0,5 vers le haut) pour
 * des entiers positifs : évite toute dérive des flottants sur les centimes.
 */
export function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Division arrondie à l'entier le plus proche, la moitié s'éloignant de zéro,
 * pour un numérateur relatif et un dénominateur strictement positif (sans `-0`).
 */
export function roundDivSigned(numerator: number, denominator: number): number {
  const rounded = roundDiv(Math.abs(numerator), denominator);
  return numerator < 0 && rounded !== 0 ? -rounded : rounded;
}
