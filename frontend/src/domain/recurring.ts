import { Bloc, BLOC_INFO } from './bloc';
import { TransactionKind } from './budget';
import { centsToInputValue, parseAmountToCents } from './money';
import { formatDateInput, isMonthOfYear, isValidDateInput, monthName, todayInputValue } from './month';

export const MAX_RECURRING_LABEL_LENGTH = 80;

export type RecurringFrequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export const FREQUENCIES: readonly RecurringFrequency[] = ['MONTHLY', 'QUARTERLY', 'YEARLY'];

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  MONTHLY: 'Chaque mois',
  QUARTERLY: 'Chaque trimestre',
  YEARLY: 'Chaque année',
};

/** Ce que l'on dit du montant saisi : « Montant par mois », « par trimestre », « par an ». */
export const FREQUENCY_AMOUNT_LABEL: Record<RecurringFrequency, string> = {
  MONTHLY: 'Montant par mois',
  QUARTERLY: 'Montant par trimestre',
  YEARLY: 'Montant par an',
};

export interface RecurringPayment {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  label: string;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  aidRuleId: string | null;
  accountId?: string | null;
  /** Absent d'un ancien serveur : on lit alors `MONTHLY` (voir `frequencyOf`). */
  frequency?: RecurringFrequency;
  monthOfYear?: number | null;
}

export interface RecurringPayload {
  kind: TransactionKind;
  bloc?: Bloc;
  label: string;
  amountCents: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  aidRuleId?: string | null;
  accountId?: string | null;
  frequency: RecurringFrequency;
  /** 1-12 pour `QUARTERLY` / `YEARLY`, `null` pour `MONTHLY`. */
  monthOfYear: number | null;
}

export interface RecurringFormValues {
  kind: TransactionKind;
  bloc: Bloc;
  label: string;
  amount: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  active: boolean;
  aidRuleId: string;
  /** Identifiant du compte, ou chaîne vide pour « Aucun ». */
  accountId: string;
  frequency: RecurringFrequency;
  /** « 1 » à « 12 ». Toujours renseigné pour ne pas laisser un choix vide ; ignoré pour `MONTHLY`. */
  monthOfYear: string;
}

export interface RecurringFormErrors {
  label?: string;
  amount?: string;
  dayOfMonth?: string;
  startDate?: string;
  endDate?: string;
  monthOfYear?: string;
}

export type RecurringFormResult =
  | { ok: true; payload: RecurringPayload }
  | { ok: false; errors: RecurringFormErrors };

/** Un serveur qui ne parle pas encore de périodicité, ou une valeur inconnue : on traite comme mensuel. */
export function frequencyOf(item: { frequency?: unknown }): RecurringFrequency {
  return FREQUENCIES.includes(item.frequency as RecurringFrequency) ? (item.frequency as RecurringFrequency) : 'MONTHLY';
}

/** Le mois de l'année d'un paiement non mensuel, ou `null` (mensuel, ou mois illisible). */
export function monthOfYearOf(item: { frequency?: unknown; monthOfYear?: unknown }): number | null {
  return frequencyOf(item) !== 'MONTHLY' && isMonthOfYear(item.monthOfYear) ? item.monthOfYear : null;
}

export function isNonMonthly(item: { frequency?: unknown }): boolean {
  return frequencyOf(item) !== 'MONTHLY';
}

/** Les 4 mois d'un paiement trimestriel qui commence en `start` : 11 → [11, 2, 5, 8]. */
export function quarterlyMonths(start: number): number[] {
  return [0, 3, 6, 9].map((offset) => ((start - 1 + offset) % 12) + 1);
}

/** « octobre, janvier, avril et juillet ». */
export function joinMonthNames(months: readonly number[]): string {
  const names = months.map(monthName);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « Paiements en novembre, février, mai et août » — la phrase « mois M, M+3, M+6, M+9 » du formulaire. */
export function describeQuarterlyMonths(start: number): string {
  return `Paiements en ${joinMonthNames(quarterlyMonths(start))}`;
}

/**
 * Ce qu'il faut mettre de côté chaque mois pour lisser un paiement non mensuel (÷ 12 par an, ÷ 3 par trimestre,
 * arrondi à l'entier supérieur comme le serveur). `0` pour un paiement mensuel : rien à provisionner.
 */
export function monthlyProvisionCents(amountCents: number, frequency: RecurringFrequency): number {
  if (frequency === 'MONTHLY') {
    return 0;
  }
  return Math.ceil(amountCents / (frequency === 'YEARLY' ? 12 : 3));
}

export function emptyRecurringForm(now: Date = new Date()): RecurringFormValues {
  return {
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: '',
    amount: '',
    dayOfMonth: '',
    startDate: todayInputValue(now),
    endDate: '',
    active: true,
    aidRuleId: '',
    accountId: '',
    frequency: 'MONTHLY',
    monthOfYear: String(now.getMonth() + 1),
  };
}

export function recurringToForm(item: RecurringPayment): RecurringFormValues {
  return {
    kind: item.kind,
    bloc: item.bloc ?? 'FIXE',
    label: item.label,
    amount: centsToInputValue(item.amountCents),
    dayOfMonth: item.dayOfMonth === null ? '' : String(item.dayOfMonth),
    startDate: item.startDate,
    endDate: item.endDate ?? '',
    active: item.active,
    aidRuleId: item.aidRuleId ?? '',
    accountId: item.accountId ?? '',
    frequency: frequencyOf(item),
    monthOfYear: String(monthOfYearOf(item) ?? startMonthOf(item.startDate)),
  };
}

function startMonthOf(startDate: string): number {
  const month = Number(startDate.slice(5, 7));
  return isMonthOfYear(month) ? month : 1;
}

export function recurringToPayload(item: RecurringPayment, overrides: Partial<RecurringPayload> = {}): RecurringPayload {
  const base: RecurringPayload = {
    kind: item.kind,
    label: item.label,
    amountCents: item.amountCents,
    dayOfMonth: item.dayOfMonth,
    startDate: item.startDate,
    endDate: item.endDate,
    active: item.active,
    frequency: frequencyOf(item),
    monthOfYear: monthOfYearOf(item),
  };
  if (item.kind === 'EXPENSE' && item.bloc) {
    base.bloc = item.bloc;
  }
  if (item.aidRuleId !== null) {
    base.aidRuleId = item.aidRuleId;
  }
  if (item.accountId) {
    base.accountId = item.accountId;
  }
  return { ...base, ...overrides };
}

const DAY_PATTERN = /^\d{1,2}$/;
const MONTH_OF_YEAR_PATTERN = /^\d{1,2}$/;

/**
 * `allowAid` : l'espace est le commun (les aides ne concernent pas l'espace personnel).
 * Une aide n'a de sens que sur une dépense : elle est effacée si on bascule sur un revenu.
 */
export function buildRecurringPayload(
  values: RecurringFormValues,
  options: { allowAid: boolean; accountSelectable?: boolean },
): RecurringFormResult {
  const errors: RecurringFormErrors = {};

  const label = values.label.trim();
  if (label === '') {
    errors.label = 'Donnez un nom à ce paiement (ex. Loyer).';
  } else if (label.length > MAX_RECURRING_LABEL_LENGTH) {
    errors.label = `Le nom est trop long (${MAX_RECURRING_LABEL_LENGTH} caractères au plus).`;
  }

  const amountCents = parseAmountToCents(values.amount);
  if (values.amount.trim() === '') {
    errors.amount = 'Saisissez un montant.';
  } else if (amountCents === null) {
    errors.amount = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 1 100 ou 12,50).';
  } else if (amountCents === 0) {
    errors.amount = 'Le montant doit être supérieur à 0.';
  }

  let dayOfMonth: number | null = null;
  const dayText = values.dayOfMonth.trim();
  if (dayText !== '') {
    const day = DAY_PATTERN.test(dayText) ? Number(dayText) : Number.NaN;
    if (!(day >= 1 && day <= 31)) {
      errors.dayOfMonth = 'Le jour doit être un nombre entre 1 et 31, ou rester vide si vous ne le connaissez pas.';
    } else {
      dayOfMonth = day;
    }
  }

  if (!isValidDateInput(values.startDate)) {
    errors.startDate = 'Choisissez une date de début valide.';
  }
  const endText = values.endDate.trim();
  if (endText !== '') {
    if (!isValidDateInput(endText)) {
      errors.endDate = 'Choisissez une date de fin valide, ou laissez vide.';
    } else if (!errors.startDate && endText < values.startDate) {
      errors.endDate = 'La date de fin ne peut pas être avant la date de début.';
    }
  }

  const frequency = FREQUENCIES.includes(values.frequency) ? values.frequency : 'MONTHLY';
  let monthOfYear: number | null = null;
  if (frequency !== 'MONTHLY') {
    const month = MONTH_OF_YEAR_PATTERN.test(values.monthOfYear.trim()) ? Number(values.monthOfYear) : Number.NaN;
    if (!isMonthOfYear(month)) {
      errors.monthOfYear =
        frequency === 'YEARLY' ? 'Choisissez le mois où ce paiement tombe chaque année.' : 'Choisissez le mois du premier paiement.';
    } else {
      monthOfYear = month;
    }
  }

  if (Object.keys(errors).length > 0 || amountCents === null) {
    return { ok: false, errors };
  }

  const payload: RecurringPayload = {
    kind: values.kind,
    label,
    amountCents,
    dayOfMonth,
    startDate: values.startDate,
    endDate: endText === '' ? null : endText,
    active: values.active,
    frequency,
    monthOfYear,
  };
  if (values.kind === 'EXPENSE') {
    payload.bloc = values.bloc;
  }
  if (options.allowAid) {
    payload.aidRuleId = values.kind === 'EXPENSE' && values.aidRuleId !== '' ? values.aidRuleId : null;
  }
  if (values.accountId !== '') {
    payload.accountId = values.accountId;
  } else if (options.accountSelectable) {
    payload.accountId = null;
  }
  return { ok: true, payload };
}

/** « Tous les ans en octobre », « Tous les 3 mois à partir de novembre », « Chaque mois ». */
export function describeFrequency(item: { frequency?: unknown; monthOfYear?: unknown }): string {
  const frequency = frequencyOf(item);
  const month = monthOfYearOf(item);
  if (frequency === 'YEARLY') {
    return month === null ? 'Tous les ans' : `Tous les ans en ${monthName(month)}`;
  }
  if (frequency === 'QUARTERLY') {
    return month === null ? 'Tous les 3 mois' : `Tous les 3 mois à partir de ${monthName(month)}`;
  }
  return 'Chaque mois';
}

export function describeSchedule(
  item: Pick<RecurringPayment, 'dayOfMonth'> & { frequency?: unknown; monthOfYear?: unknown },
): string {
  if (isNonMonthly(item)) {
    const day = item.dayOfMonth === null ? 'compté en fin de mois' : item.dayOfMonth === 1 ? 'le 1er' : `le ${item.dayOfMonth}`;
    return `${describeFrequency(item)}, ${day}`;
  }
  return item.dayOfMonth === null
    ? 'Jour inconnu : compté en fin de mois'
    : item.dayOfMonth === 1
      ? 'Le 1er de chaque mois'
      : `Le ${item.dayOfMonth} de chaque mois`;
}

export function describePeriod(item: Pick<RecurringPayment, 'startDate' | 'endDate'>): string {
  return item.endDate
    ? `Du ${formatDateInput(item.startDate)} au ${formatDateInput(item.endDate)}`
    : `Depuis le ${formatDateInput(item.startDate)}`;
}

export function describeBloc(item: Pick<RecurringPayment, 'kind' | 'bloc'>): string {
  return item.kind === 'INCOME' || !item.bloc ? 'Revenu' : BLOC_INFO[item.bloc].label;
}

/** Les paiements actifs d'abord, puis les revenus avant les dépenses, puis par jour du mois (inconnu à la fin). */
export function sortRecurring(items: readonly RecurringPayment[]): RecurringPayment[] {
  return [...items].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    if (a.kind !== b.kind) {
      return a.kind === 'INCOME' ? -1 : 1;
    }
    const dayA = a.dayOfMonth ?? 99;
    const dayB = b.dayOfMonth ?? 99;
    return dayA - dayB || a.label.localeCompare(b.label, 'fr');
  });
}

/** Ce qui revient chaque mois : les paiements trimestriels et annuels n'y sont pas comptés (voir les provisions). */
export function monthlyTotals(items: readonly RecurringPayment[]): { incomeCents: number; expenseCents: number } {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of items) {
    if (!item.active || isNonMonthly(item)) {
      continue;
    }
    if (item.kind === 'INCOME') {
      incomeCents += item.amountCents;
    } else {
      expenseCents += item.amountCents;
    }
  }
  return { incomeCents, expenseCents };
}

export function countNonMonthly(items: readonly RecurringPayment[]): number {
  return items.filter((item) => item.active && isNonMonthly(item)).length;
}
