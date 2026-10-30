import { DomainError } from '../shared/domain-error';
import { roundDiv } from '../shared/rounding';

export const CRECHE_KINDS = ['COLLECTIVE'] as const;
export type CrecheKind = (typeof CRECHE_KINDS)[number];

/**
 * Barème de la participation familiale en crèche financée par la prestation de
 * service unique (PSU) de la CNAF, accueil collectif et micro-crèche.
 * Source : guide PSU 2026 de la CNAF.
 */
export const CRECHE_SOURCE_URL =
  'https://www.caf.fr/sites/default/files/medias/493/Partenaires/Petite-enfance/EAJE/Guide_PSU_2026_02_V_Def.pdf';
export const CRECHE_VERIFIED_ON = '2026-10-30';

/** Ressources mensuelles minimales retenues, en centimes. À VÉRIFIER CHAQUE ANNÉE (guide PSU de la CNAF). */
export const CRECHE_RESOURCES_FLOOR_CENTS = 81_462;
/**
 * Ressources mensuelles maximales retenues, en centimes. À VÉRIFIER CHAQUE
 * ANNÉE (guide PSU de la CNAF) : une crèche peut appliquer un plafond plus haut.
 */
export const CRECHE_RESOURCES_CEILING_CENTS = 850_000;

/** Un taux d'effort s'exprime en micro-pourcentages entiers : 619 = 0,0619 % = 0,000619. */
const RATE_DENOMINATOR = 1_000_000;
const RATE_TO_PERCENT = 10_000;

/** Taux d'effort par heure facturée, en micro-pourcentages, selon le nombre d'enfants à charge. */
export function effortRateMicro(children: number): number {
  if (children >= 8) return 206;
  if (children >= 4) return 310;
  if (children === 3) return 413;
  if (children === 2) return 516;
  return 619;
}

export const MAX_HOURS_PER_MONTH = 400;
export const MAX_ANNUAL_RESOURCES_CENTS = 10_000_000_000;

export interface CrecheEstimateInput {
  annualResourcesCents: number;
  children: number;
  hoursPerMonth: number;
  kind: CrecheKind;
}

export interface CrecheEstimate {
  kind: CrecheKind;
  /** Taux d'effort en %, par heure facturée (0,031 = 0,031 %). */
  effortRatePercent: number;
  monthlyResourcesUsedCents: number;
  hourlyRateCents: number;
  monthlyBillCents: number;
  floorCents: number;
  ceilingCents: number;
  ceilingApplied: boolean;
  floorApplied: boolean;
  verifiedOn: string;
  sourceUrl: string;
}

/**
 * Tarif horaire = ressources mensuelles (annuelles N-2 ÷ 12, encadrées par un
 * plancher et un plafond) × taux d'effort ; facture = tarif horaire arrondi au
 * centime × heures facturées. Tout est calculé en entiers (centimes, micro-pourcentages).
 */
export function estimateCreche(input: CrecheEstimateInput): CrecheEstimate {
  const { annualResourcesCents, children, hoursPerMonth, kind } = input;
  if (!(CRECHE_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError("Type d'accueil inconnu : COLLECTIVE uniquement");
  }
  if (
    !Number.isInteger(annualResourcesCents) ||
    annualResourcesCents < 0 ||
    annualResourcesCents > MAX_ANNUAL_RESOURCES_CENTS
  ) {
    throw new DomainError(
      'Les ressources annuelles doivent être un entier positif ou nul (en centimes)',
    );
  }
  if (!Number.isInteger(children) || children < 1) {
    throw new DomainError("Le nombre d'enfants à charge doit être au moins 1");
  }
  if (
    !Number.isFinite(hoursPerMonth) ||
    hoursPerMonth < 0 ||
    hoursPerMonth > MAX_HOURS_PER_MONTH
  ) {
    throw new DomainError(
      `Les heures facturées par mois doivent être comprises entre 0 et ${MAX_HOURS_PER_MONTH}`,
    );
  }

  const rateMicro = effortRateMicro(children);
  const monthlyCents = roundDiv(annualResourcesCents, 12);
  const floorApplied = monthlyCents < CRECHE_RESOURCES_FLOOR_CENTS;
  const ceilingApplied = monthlyCents > CRECHE_RESOURCES_CEILING_CENTS;
  const monthlyResourcesUsedCents = Math.min(
    Math.max(monthlyCents, CRECHE_RESOURCES_FLOOR_CENTS),
    CRECHE_RESOURCES_CEILING_CENTS,
  );
  const hourlyRateCents = roundDiv(
    monthlyResourcesUsedCents * rateMicro,
    RATE_DENOMINATOR,
  );
  // Les heures sont comptées au centième d'heure près, en entiers.
  const hundredthsOfHours = Math.round(hoursPerMonth * 100);
  const monthlyBillCents = roundDiv(hourlyRateCents * hundredthsOfHours, 100);

  return {
    kind,
    effortRatePercent: rateMicro / RATE_TO_PERCENT,
    monthlyResourcesUsedCents,
    hourlyRateCents,
    monthlyBillCents,
    floorCents: CRECHE_RESOURCES_FLOOR_CENTS,
    ceilingCents: CRECHE_RESOURCES_CEILING_CENTS,
    ceilingApplied,
    floorApplied,
    verifiedOn: CRECHE_VERIFIED_ON,
    sourceUrl: CRECHE_SOURCE_URL,
  };
}
