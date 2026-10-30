import { addMonthsClamped } from '../budget/provisions';
import { daysInMonth, startOfUtcDay, toIsoDate } from '../shared/calendar';
import { roundDiv } from '../shared/rounding';

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

export interface Amortization {
  /** false : la mensualité ne fait pas diminuer la dette (ou plus de 1200 mois). */
  paidOff: boolean;
  /** Nombre de mensualités restantes (0 si rien n'est dû) ; null si jamais remboursé. */
  months: number | null;
  /** Somme des intérêts jusqu'au solde ; null si jamais remboursé. */
  totalInterestCents: number | null;
  /** Montant de la dernière mensualité (ajustée) ; null si 0 mensualité ou jamais remboursé. */
  lastPaymentCents: number | null;
}

/**
 * Simule l'amortissement à mensualité fixe : chaque mois l'intérêt est calculé
 * sur le capital restant, la mensualité le couvre puis réduit le capital ; la
 * dernière mensualité est ajustée au solde. Si la mensualité ne couvre pas
 * l'intérêt du premier mois (la dette ne diminue pas), ou si le solde n'est pas
 * atteint en 1200 mois, le crédit n'est jamais remboursé.
 */
export function amortize(
  remainingCents: number,
  annualRateHundredths: number,
  monthlyPaymentCents: number,
): Amortization {
  const never: Amortization = {
    paidOff: false,
    months: null,
    totalInterestCents: null,
    lastPaymentCents: null,
  };
  if (remainingCents <= 0) {
    return {
      paidOff: true,
      months: 0,
      totalInterestCents: 0,
      lastPaymentCents: null,
    };
  }
  let balance = remainingCents;
  let months = 0;
  let totalInterest = 0;
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
  };
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
