import { Bloc, BLOC_INFO } from './bloc';
import { TransactionKind, TransactionPayload } from './budget';
import { parseAmountToCents } from './money';
import { isValidDateInput, toApiDate } from './month';

export const MAX_LABEL_LENGTH = 40;

export interface TransactionFormValues {
  kind: TransactionKind;
  amount: string;
  bloc: Bloc;
  label: string;
  date: string;
}

export interface TransactionFormErrors {
  amount?: string;
  date?: string;
}

export type TransactionFormResult =
  | { ok: true; payload: TransactionPayload }
  | { ok: false; errors: TransactionFormErrors };

export function defaultLabel(kind: TransactionKind, bloc: Bloc): string {
  return kind === 'INCOME' ? 'Revenu' : BLOC_INFO[bloc].label;
}

export function buildTransactionPayload(
  values: TransactionFormValues,
  now: Date = new Date(),
  original?: { date: string },
): TransactionFormResult {
  const errors: TransactionFormErrors = {};

  const amountCents = parseAmountToCents(values.amount);
  if (values.amount.trim() === '') {
    errors.amount = 'Saisissez un montant.';
  } else if (amountCents === null) {
    errors.amount = 'Montant invalide : utilisez des chiffres et au plus 2 décimales (ex. 12,50).';
  } else if (amountCents === 0) {
    errors.amount = 'Le montant doit être supérieur à 0.';
  }

  if (!isValidDateInput(values.date)) {
    errors.date = 'Choisissez une date valide.';
  }

  if (errors.amount || errors.date || amountCents === null) {
    return { ok: false, errors };
  }

  const label = values.label.trim().slice(0, MAX_LABEL_LENGTH) || defaultLabel(values.kind, values.bloc);
  const date =
    original && original.date.slice(0, 10) === values.date ? original.date : toApiDate(values.date, now);
  const payload: TransactionPayload =
    values.kind === 'EXPENSE'
      ? { kind: 'EXPENSE', bloc: values.bloc, label, amountCents, date }
      : { kind: 'INCOME', label, amountCents, date };
  return { ok: true, payload };
}
