import { currentMonth, parseMonth } from '../budget/month';
import { shiftMonth } from '../trend/trends';
import { DomainError } from '../shared/domain-error';
import { MAX_LABEL_LENGTH } from '../transaction/transaction';

export type ContributionStatus =
  | 'PAID'
  | 'PARTIAL'
  | 'PENDING'
  | 'OVERPAID'
  | 'NONE'
  | 'UNKNOWN';

/** Au-delà de ce surplus (1 €), une contribution est dite « versée en trop ». */
export const OVERPAID_TOLERANCE_CENTS = 100;

/** Libellé du revenu créé dans l'espace personnel du membre qui verse. */
export const PERSONAL_CONTRIBUTION_LABEL = 'Contribution au foyer';

/**
 * On peut déclarer une contribution pour le mois courant, un mois passé ou le mois
 * suivant (versement fait en avance), pas au-delà.
 */
export function assertContributionMonth(month: string, now: Date): void {
  parseMonth(month);
  if (month > shiftMonth(currentMonth(now), 1)) {
    throw new DomainError(
      'Le mois de la contribution ne peut pas dépasser le mois prochain',
    );
  }
}

/** « Contribution de Alice » : le prénom est le premier mot du nom du membre. */
export function contributionLabel(memberName: string): string {
  const prefix = 'Contribution de ';
  const firstName = memberName.trim().split(/\s+/)[0] || 'Membre';
  return `${prefix}${firstName}`.slice(0, MAX_LABEL_LENGTH);
}

export interface MemberContributionStatus {
  /** null si la règle du foyer ne peut pas être calculée. */
  remainingCents: number | null;
  status: ContributionStatus;
}

/**
 * Statut de la contribution d'un membre pour un mois, en centimes entiers.
 * `expectedCents` null = règle incalculable (revenus manquants) : UNKNOWN.
 */
export function contributionStatus(
  expectedCents: number | null,
  paidCents: number,
): MemberContributionStatus {
  if (expectedCents === null) {
    return { remainingCents: null, status: 'UNKNOWN' };
  }
  const remainingCents = Math.max(0, expectedCents - paidCents);
  if (expectedCents === 0) {
    return { remainingCents, status: 'NONE' };
  }
  if (paidCents > expectedCents + OVERPAID_TOLERANCE_CENTS) {
    return { remainingCents, status: 'OVERPAID' };
  }
  if (paidCents >= expectedCents) {
    return { remainingCents, status: 'PAID' };
  }
  return { remainingCents, status: paidCents > 0 ? 'PARTIAL' : 'PENDING' };
}
