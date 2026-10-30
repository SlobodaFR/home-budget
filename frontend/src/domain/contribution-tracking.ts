import { Bloc } from './bloc';
import { centsToInputValue, formatCentsShort, parseAmountToCents } from './money';
import { currentMonth, formatLongDateInput, isMonth, isValidDateInput, shiftMonth, todayInputValue } from './month';

export type ContributionStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERPAID' | 'NONE' | 'UNKNOWN';

export const CONTRIBUTION_STATUSES: readonly ContributionStatus[] = ['PAID', 'PARTIAL', 'PENDING', 'OVERPAID', 'NONE', 'UNKNOWN'];

/** Au-delà de cette marge (1 €), un versement plus grand que prévu est dit « en trop » (règle du serveur). */
export const OVERPAID_MARGIN_CENTS = 100;

export const CONTRIBUTION_STATUS_LABEL: Record<ContributionStatus, string> = {
  PAID: 'Versé',
  PARTIAL: 'Versé en partie',
  PENDING: 'À verser',
  OVERPAID: 'Versé en plus',
  NONE: 'Rien à verser',
  UNKNOWN: 'À calculer',
};

export interface MemberContribution {
  userId: string;
  name: string;
  /** `null` : la règle du foyer ne peut pas être calculée (revenus manquants). */
  expectedCents: number | null;
  paidCents: number;
  /** `null` quand l'attendu est inconnu. */
  remainingCents: number | null;
  status: ContributionStatus;
  isMe: boolean;
}

export interface ContributionReport {
  month: string;
  incomplete: boolean;
  members: MemberContribution[];
  /** `null` quand `incomplete`. */
  totalExpectedCents: number | null;
  totalPaidCents: number;
}

export interface ContributionPaymentPayload {
  month: string;
  amountCents: number;
  /** `AAAA-MM-JJ`. */
  date: string;
  accountId?: string;
  debitPersonal?: boolean;
  personalAccountId?: string;
  personalBloc?: Bloc;
}

export interface ContributionPaymentResult {
  transactionId: string;
  personalTransactionId: string | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture tolérante des réponses du serveur
// ---------------------------------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const asObject = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Le statut quand le serveur ne l'envoie pas (ou en envoie un inconnu) : on le déduit des montants plutôt que de le supposer. */
export function deduceStatus(expectedCents: number | null, paidCents: number): ContributionStatus {
  if (expectedCents === null) {
    return 'UNKNOWN';
  }
  if (expectedCents <= 0) {
    return 'NONE';
  }
  if (paidCents > expectedCents + OVERPAID_MARGIN_CENTS) {
    return 'OVERPAID';
  }
  if (paidCents >= expectedCents) {
    return 'PAID';
  }
  return paidCents > 0 ? 'PARTIAL' : 'PENDING';
}

function parseMember(raw: unknown): MemberContribution | null {
  const item = asObject(raw);
  if (typeof item.userId !== 'string' || typeof item.name !== 'string') {
    return null;
  }
  const expectedCents = isNumber(item.expectedCents) ? Math.max(0, Math.round(item.expectedCents)) : null;
  const paidCents = isNumber(item.paidCents) ? Math.max(0, Math.round(item.paidCents)) : 0;
  const status = CONTRIBUTION_STATUSES.includes(item.status as ContributionStatus) ? (item.status as ContributionStatus) : deduceStatus(expectedCents, paidCents);
  return {
    userId: item.userId,
    name: item.name,
    expectedCents,
    paidCents,
    remainingCents: expectedCents === null ? null : isNumber(item.remainingCents) ? Math.max(0, Math.round(item.remainingCents)) : Math.max(0, expectedCents - paidCents),
    status,
    isMe: item.isMe === true,
  };
}

export function parseContributionReport(raw: unknown, fallbackMonth: string): ContributionReport {
  const source = asObject(raw);
  const members: MemberContribution[] = [];
  if (Array.isArray(source.members)) {
    for (const entry of source.members as unknown[]) {
      const member = parseMember(entry);
      if (member) {
        members.push(member);
      }
    }
  }
  const incomplete = source.incomplete === true || (members.length > 0 && members.some((member) => member.expectedCents === null));
  return {
    month: typeof source.month === 'string' && isMonth(source.month) ? source.month : fallbackMonth,
    incomplete,
    members,
    totalExpectedCents: incomplete ? null : isNumber(source.totalExpectedCents) ? Math.max(0, Math.round(source.totalExpectedCents)) : members.reduce((sum, member) => sum + (member.expectedCents ?? 0), 0),
    totalPaidCents: isNumber(source.totalPaidCents) ? Math.max(0, Math.round(source.totalPaidCents)) : members.reduce((sum, member) => sum + member.paidCents, 0),
  };
}

export function parsePaymentResult(raw: unknown): ContributionPaymentResult {
  const source = asObject(raw);
  return {
    transactionId: typeof source.transactionId === 'string' ? source.transactionId : '',
    personalTransactionId: typeof source.personalTransactionId === 'string' ? source.personalTransactionId : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------------------------------------------------

/** Le dernier mois que l'on peut consulter ou saisir : le mois prochain (le serveur refuse au-delà). */
export function maxContributionMonth(now: Date = new Date()): string {
  return shiftMonth(currentMonth(now), 1);
}

export const myContribution = (report: Pick<ContributionReport, 'members'>): MemberContribution | null => report.members.find((member) => member.isMe) ?? null;

/** Une contribution est encore à faire (ou à compléter, ou à calculer) : on propose alors le bouton de versement en avant. */
export const needsPayment = (member: Pick<MemberContribution, 'status'>): boolean => member.status === 'PENDING' || member.status === 'PARTIAL';

/** Avancement (0-100) du versé sur l'attendu ; `null` quand il n'y a rien à comparer. */
export function progressPercent(member: Pick<MemberContribution, 'expectedCents' | 'paidCents'>): number | null {
  if (member.expectedCents === null || member.expectedCents <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.floor((member.paidCents / member.expectedCents) * 100)));
}

/** « 1 200 € versés sur 1 750 € attendus » : lu par les lecteurs d'écran et affiché sous la barre. */
export function describeProgress(member: Pick<MemberContribution, 'expectedCents' | 'paidCents'>): string | null {
  return member.expectedCents === null || member.expectedCents <= 0 ? null : `${formatCentsShort(member.paidCents)} versés sur ${formatCentsShort(member.expectedCents)} attendus`;
}

/** La phrase qui dit où en est un membre, en toutes lettres. */
export function describeMemberStatus(member: Pick<MemberContribution, 'status' | 'expectedCents' | 'paidCents' | 'remainingCents'>): string {
  const remaining = formatCentsShort(member.remainingCents ?? 0);
  switch (member.status) {
    case 'PAID':
      return 'Contribution versée, merci !';
    case 'PARTIAL':
      return `Il reste ${remaining} à verser.`;
    case 'PENDING':
      return `Rien n’a encore été versé : il reste ${remaining} à verser.`;
    case 'OVERPAID':
      return `Vous avez versé ${formatCentsShort(member.paidCents - (member.expectedCents ?? 0))} de plus que prévu.`;
    case 'NONE':
      return 'Rien à verser ce mois-ci.';
    default:
      return member.paidCents > 0 ? 'Le montant attendu ne peut pas encore être calculé.' : 'Le montant attendu ne peut pas encore être calculé : il manque des revenus.';
  }
}

export function describeTotals(report: Pick<ContributionReport, 'totalExpectedCents' | 'totalPaidCents'>): string {
  return report.totalExpectedCents === null
    ? `Total versé : ${formatCentsShort(report.totalPaidCents)}`
    : `Total versé : ${formatCentsShort(report.totalPaidCents)} sur ${formatCentsShort(report.totalExpectedCents)} attendus`;
}

export const INCOMPLETE_MESSAGE =
  'Il manque des revenus pour calculer la contribution de chacun. Chaque membre indique son revenu net mensuel (ci-dessus) : dès que tout le monde l’a fait, les montants attendus apparaissent ici.';

// ---------------------------------------------------------------------------------------------------------------------
// Formulaire « J'ai versé ma contribution »
// ---------------------------------------------------------------------------------------------------------------------

export interface ContributionFormValues {
  /** Montant versé, en euros. */
  amount: string;
  date: string;
  /** Compte de l'espace commun, ou chaîne vide pour « Aucun ». */
  accountId: string;
  /** « Retirer aussi de mon espace perso » : crée la dépense correspondante côté perso. */
  debitPersonal: boolean;
  personalBloc: Bloc;
  /** Compte de l'espace perso, ou chaîne vide pour « Aucun ». */
  personalAccountId: string;
}

export interface ContributionFormErrors {
  amount?: string;
  date?: string;
  month?: string;
}

export type ContributionFormResult = { ok: true; payload: ContributionPaymentPayload } | { ok: false; errors: ContributionFormErrors };

export const DEFAULT_PERSONAL_BLOC: Bloc = 'FIXE';

/** Le montant est prérempli avec ce qu'il reste à verser ; la date du jour ; « Fixe » comme bloc perso. */
export function emptyContributionForm(member: Pick<MemberContribution, 'remainingCents'> | null, now: Date = new Date()): ContributionFormValues {
  const remaining = member?.remainingCents ?? 0;
  return {
    amount: remaining > 0 ? centsToInputValue(remaining) : '',
    date: todayInputValue(now),
    accountId: '',
    debitPersonal: false,
    personalBloc: DEFAULT_PERSONAL_BLOC,
    personalAccountId: '',
  };
}

export function buildContributionPayload(values: ContributionFormValues, month: string): ContributionFormResult {
  const errors: ContributionFormErrors = {};

  if (!isMonth(month)) {
    errors.month = 'Le mois n’est pas valide : choisissez-le de nouveau.';
  }

  const cents = parseAmountToCents(values.amount);
  if (values.amount.trim() === '') {
    errors.amount = 'Indiquez le montant que vous avez versé.';
  } else if (cents === null) {
    errors.amount = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 1 200 ou 875,50).';
  } else if (cents === 0) {
    errors.amount = 'Le montant doit être supérieur à 0.';
  }

  if (!isValidDateInput(values.date)) {
    errors.date = 'Choisissez la date du versement.';
  }

  if (Object.keys(errors).length > 0 || cents === null) {
    return { ok: false, errors };
  }

  const payload: ContributionPaymentPayload = { month, amountCents: cents, date: values.date };
  if (values.accountId !== '') {
    payload.accountId = values.accountId;
  }
  if (values.debitPersonal) {
    // Les champs « perso » ne sont envoyés que si la case est cochée (le serveur refuse un compte perso sans débit perso).
    payload.debitPersonal = true;
    payload.personalBloc = values.personalBloc;
    if (values.personalAccountId !== '') {
      payload.personalAccountId = values.personalAccountId;
    }
  }
  return { ok: true, payload };
}

/** « Contribution de novembre 2026 : 1 200 € le 3 novembre 2026. » */
export function describePayment(payload: Pick<ContributionPaymentPayload, 'amountCents' | 'date'>): string {
  return `${formatCentsShort(payload.amountCents)} le ${formatLongDateInput(payload.date)}`;
}
