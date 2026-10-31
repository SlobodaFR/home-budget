import { addMonthsClamped } from '../budget/provisions';
import { daysInMonth, startOfUtcDay, toIsoDate } from '../shared/calendar';
import { roundDiv } from '../shared/rounding';
import type { Debt, InsuranceMode } from './debt';

/** Au-delà de 100 ans de mensualités, on considère que le crédit n'est jamais remboursé. */
export const MAX_SIMULATION_MONTHS = 1200;

const RATE_DENOMINATOR = 12 * 10_000;

/**
 * Intérêt d'un mois : capital × taux annuel (centièmes de pourcent) ÷ (12 × 10 000),
 * arrondi à l'entier le plus proche, la moitié vers le haut. Tout en entiers.
 */
export function monthlyInterestCents(
  balanceCents: number,
  annualRateHundredths: number,
): number {
  return roundDiv(balanceCents * annualRateHundredths, RATE_DENOMINATOR);
}

/** Dénominateur de l'assurance en pourcentage : 12 mois × 10 000 (centièmes de %) × 100 (quotité en %). */
const INSURANCE_DENOMINATOR = 12 * 10_000 * 100;

/** Règle de calcul de l'assurance emprunteur d'un crédit. */
export interface InsuranceTerms {
  mode: InsuranceMode;
  /** Mode FIXED : montant mensuel total saisi (la quotité est ignorée). */
  fixedMonthlyCents: number;
  /** Mode PERCENT_INITIAL : base de calcul. */
  principalCents: number;
  /** Taux annuel en centièmes de pourcent (modes en pourcentage). */
  rateHundredths: number | null;
  quotityPercent: number;
}

export function insuranceTermsOf(debt: Debt): InsuranceTerms {
  return {
    mode: debt.insuranceMode,
    fixedMonthlyCents: debt.insuranceMonthlyCents,
    principalCents: debt.principalCents,
    rateHundredths: debt.insuranceRateHundredths,
    quotityPercent: debt.insuranceQuotityPercent,
  };
}

/**
 * base × taux × quotité ÷ (12 × 10 000 × 100), arrondi au plus proche (moitié vers le
 * haut). Tout en entiers ; le produit peut dépasser 2^53 pour de très gros montants :
 * on bascule alors en BigInt plutôt que de perdre des centimes.
 */
function percentInsuranceCents(
  baseCents: number,
  rateHundredths: number,
  quotityPercent: number,
): number {
  const numerator = baseCents * rateHundredths * quotityPercent;
  if (Number.isSafeInteger(numerator * 2 + INSURANCE_DENOMINATOR)) {
    return roundDiv(numerator, INSURANCE_DENOMINATOR);
  }
  const exact =
    BigInt(baseCents) * BigInt(rateHundredths) * BigInt(quotityPercent);
  const denominator = BigInt(INSURANCE_DENOMINATOR);
  return Number((2n * exact + denominator) / (2n * denominator));
}

/**
 * Assurance d'un mois pour un capital restant dû donné (celui du début du mois) :
 * montant saisi (FIXED), % du capital emprunté (PERCENT_INITIAL) ou % du capital
 * restant (PERCENT_REMAINING).
 */
export function monthlyInsuranceCents(
  terms: InsuranceTerms,
  balanceCents: number,
): number {
  if (terms.mode === 'FIXED' || terms.rateHundredths === null) {
    return terms.fixedMonthlyCents;
  }
  return percentInsuranceCents(
    terms.mode === 'PERCENT_INITIAL' ? terms.principalCents : balanceCents,
    terms.rateHundredths,
    terms.quotityPercent,
  );
}

export interface Amortization {
  /** false : la mensualité ne fait pas diminuer la dette (ou plus de 1200 mois). */
  paidOff: boolean;
  /** Nombre de mensualités restantes (0 si rien n'est dû) ; null si jamais remboursé. */
  months: number | null;
  /** Somme des intérêts jusqu'au solde ; null si jamais remboursé. */
  totalInterestCents: number | null;
  /** Montant de la dernière mensualité (ajustée) ; null si 0 mensualité ou jamais remboursé. */
  lastPaymentCents: number | null;
  /**
   * Somme des assurances des mensualités restantes (calcul mois par mois sur le
   * capital du début du mois) ; 0 sans règle d'assurance, null si jamais remboursé.
   */
  totalInsuranceCents: number | null;
}

/**
 * Simule l'amortissement à mensualité fixe : chaque mois l'intérêt est calculé
 * sur le capital restant, la mensualité le couvre puis réduit le capital ; la
 * dernière mensualité est ajustée au solde. Si la mensualité ne couvre pas
 * l'intérêt du premier mois (la dette ne diminue pas), ou si le solde n'est pas
 * atteint en 1200 mois, le crédit n'est jamais remboursé. Avec `insurance`, la
 * même boucle cumule l'assurance de chaque mensualité (hors mensualité : elle
 * n'entre pas dans l'amortissement du capital).
 */
export function amortize(
  remainingCents: number,
  annualRateHundredths: number,
  monthlyPaymentCents: number,
  insurance?: InsuranceTerms,
): Amortization {
  const never: Amortization = {
    paidOff: false,
    months: null,
    totalInterestCents: null,
    lastPaymentCents: null,
    totalInsuranceCents: null,
  };
  if (remainingCents <= 0) {
    return {
      paidOff: true,
      months: 0,
      totalInterestCents: 0,
      lastPaymentCents: null,
      totalInsuranceCents: 0,
    };
  }
  let balance = remainingCents;
  let months = 0;
  let totalInterest = 0;
  let totalInsurance = 0;
  let last = 0;
  while (balance > 0) {
    if (months >= MAX_SIMULATION_MONTHS) {
      return never;
    }
    const interest = monthlyInterestCents(balance, annualRateHundredths);
    if (months === 0 && monthlyPaymentCents <= interest) {
      return never;
    }
    const payment = Math.min(monthlyPaymentCents, balance + interest);
    if (insurance) {
      totalInsurance += monthlyInsuranceCents(insurance, balance);
    }
    balance = balance + interest - payment;
    totalInterest += interest;
    last = payment;
    months += 1;
  }
  return {
    paidOff: true,
    months,
    totalInterestCents: totalInterest,
    lastPaymentCents: last,
    totalInsuranceCents: totalInsurance,
  };
}

/** Tolérance de la vérification de mensualité : écart d'au plus 2 % de la mensualité attendue. */
export const PAYMENT_GAP_TOLERANCE_PERCENT = 2;

/**
 * Plus petite mensualité constante qui solde `principalCents` en `termMonths`
 * mensualités au plus, avec la simulation d'amortissement entière ci-dessus
 * (la dernière mensualité peut être plus faible). Recherche par dichotomie : plus la
 * mensualité est grande, moins il faut de mois (la simulation est monotone).
 *
 * Terminaison : la borne haute (capital + intérêts du 1er mois) solde toujours le
 * prêt en 1 mensualité, donc la recherche est dans [1, capital + intérêts] et
 * l'intervalle diminue à chaque tour (au plus ~41 tours pour 10 Md€).
 */
export function expectedMonthlyPaymentCents(
  principalCents: number,
  annualRateHundredths: number,
  termMonths: number,
): number {
  const settles = (payment: number): boolean => {
    const plan = amortize(principalCents, annualRateHundredths, payment);
    return plan.paidOff && (plan.months ?? 0) <= termMonths;
  };
  let low = 1;
  let high =
    principalCents + monthlyInterestCents(principalCents, annualRateHundredths);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (settles(middle)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return high;
}

/** Prochaine date de prélèvement à partir d'aujourd'hui (aujourd'hui inclus). */
export function nextPaymentDate(today: Date, paymentDay: number): Date {
  const start = startOfUtcDay(today);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = Math.min(paymentDay, daysInMonth(year, month));
  const thisMonth = new Date(Date.UTC(year, month, day));
  if (thisMonth.getTime() >= start.getTime()) {
    return thisMonth;
  }
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = (month + 1) % 12;
  return new Date(
    Date.UTC(
      nextYear,
      nextMonth,
      Math.min(paymentDay, daysInMonth(nextYear, nextMonth)),
    ),
  );
}

/** Date de la dernière mensualité : la 1re échéance à venir + (mois − 1) mois, jour ramené au dernier jour du mois si besoin. */
export function payoffDate(
  today: Date,
  paymentDay: number,
  months: number,
): string | null {
  if (months <= 0) {
    return null;
  }
  return toIsoDate(
    addMonthsClamped(nextPaymentDate(today, paymentDay), months - 1),
  );
}
