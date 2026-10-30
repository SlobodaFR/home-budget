import { Bloc, BLOC_INFO } from './bloc';
import { TransactionKind } from './budget';
import { centsToInputValue, parseAmountToCents } from './money';
import { formatDateInput, isValidDateInput, todayInputValue } from './month';

export const MAX_RECURRING_LABEL_LENGTH = 80;

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
}

export interface RecurringFormErrors {
  label?: string;
  amount?: string;
  dayOfMonth?: string;
  startDate?: string;
  endDate?: string;
}

export type RecurringFormResult =
  | { ok: true; payload: RecurringPayload }
  | { ok: false; errors: RecurringFormErrors };

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
  };
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

export function describeSchedule(item: Pick<RecurringPayment, 'dayOfMonth'>): string {
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

export function monthlyTotals(items: readonly RecurringPayment[]): { incomeCents: number; expenseCents: number } {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const item of items) {
    if (!item.active) {
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
