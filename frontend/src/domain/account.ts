import { formatCents, parseSignedAmountToCents, signedCentsToInputValue } from './money';
import { isValidDateInput, todayInputValue } from './month';

export type AccountKind = 'CHECKING' | 'SAVINGS' | 'CASH';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['CHECKING', 'SAVINGS', 'CASH'];

export const ACCOUNT_KIND_INFO: Record<AccountKind, { label: string; description: string }> = {
  CHECKING: { label: 'Compte courant', description: 'Là où arrivent les revenus et partent les paiements.' },
  SAVINGS: { label: 'Livret ou épargne', description: 'L’argent mis de côté.' },
  CASH: { label: 'Espèces', description: 'Le porte-monnaie ou la cagnotte à la maison.' },
};

export const MAX_ACCOUNT_NAME_LENGTH = 60;

export interface Account {
  id: string;
  spaceId: string;
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  openingDate: string;
  archived: boolean;
  balanceCents: number;
  projectedMonthEndCents: number;
  transactionCount: number;
}

export interface AccountPayload {
  name: string;
  kind: AccountKind;
  openingBalanceCents: number;
  openingDate: string;
  archived?: boolean;
}

export interface AccountFormValues {
  name: string;
  kind: AccountKind;
  /** Montant signé en euros : « -150 » pour un découvert. Vide = 0. */
  openingBalance: string;
  openingDate: string;
}

export interface AccountFormErrors {
  name?: string;
  openingBalance?: string;
  openingDate?: string;
}

export type AccountFormResult = { ok: true; payload: AccountPayload } | { ok: false; errors: AccountFormErrors };

export function emptyAccountForm(now: Date = new Date()): AccountFormValues {
  return { name: '', kind: 'CHECKING', openingBalance: '', openingDate: todayInputValue(now) };
}

export function accountToForm(account: Account): AccountFormValues {
  return {
    name: account.name,
    kind: account.kind,
    openingBalance: signedCentsToInputValue(account.openingBalanceCents),
    openingDate: account.openingDate,
  };
}

const normalizeName = (name: string) =>
  name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** `existing` : les autres comptes de l'espace (archivés compris), pour refuser un nom déjà pris avant d'appeler le serveur. */
export function buildAccountPayload(
  values: AccountFormValues,
  existing: readonly Pick<Account, 'id' | 'name'>[] = [],
  editingId?: string,
): AccountFormResult {
  const errors: AccountFormErrors = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Donnez un nom à ce compte (ex. Compte commun).';
  } else if (name.length > MAX_ACCOUNT_NAME_LENGTH) {
    errors.name = `Le nom est trop long (${MAX_ACCOUNT_NAME_LENGTH} caractères au plus).`;
  } else if (existing.some((account) => account.id !== editingId && normalizeName(account.name) === normalizeName(name))) {
    errors.name = 'Un compte porte déjà ce nom dans cet espace : choisissez-en un autre.';
  }

  const openingBalanceCents = values.openingBalance.trim() === '' ? 0 : parseSignedAmountToCents(values.openingBalance);
  if (openingBalanceCents === null) {
    errors.openingBalance = 'Montant invalide : utilisez des chiffres, au plus 2 décimales, et « - » pour un découvert (ex. 1 200 ou -150).';
  }

  if (!isValidDateInput(values.openingDate)) {
    errors.openingDate = 'Choisissez une date valide.';
  }

  if (Object.keys(errors).length > 0 || openingBalanceCents === null) {
    return { ok: false, errors };
  }
  return { ok: true, payload: { name, kind: values.kind, openingBalanceCents, openingDate: values.openingDate } };
}

export function accountToPayload(account: Account, overrides: Partial<AccountPayload> = {}): AccountPayload {
  return {
    name: account.name,
    kind: account.kind,
    openingBalanceCents: account.openingBalanceCents,
    openingDate: account.openingDate,
    archived: account.archived,
    ...overrides,
  };
}

export function activeAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => !account.archived);
}

export function archivedAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => account.archived);
}

/** Comptes proposables dans un sélecteur : les non archivés, plus le compte déjà choisi même archivé (pour ne pas le perdre en silence). */
export function selectableAccounts(accounts: readonly Account[], currentId: string | null = null): Account[] {
  return accounts.filter((account) => !account.archived || account.id === currentId);
}

/** Le dernier compte choisi dans l'espace, s'il existe encore et n'est pas archivé ; sinon « Aucun ». */
export function resolveDefaultAccount(accounts: readonly Account[], rememberedId: string | null): string | null {
  return rememberedId !== null && activeAccounts(accounts).some((account) => account.id === rememberedId) ? rememberedId : null;
}

export function accountName(accounts: readonly Account[], id: string | null | undefined): string | null {
  return id ? (accounts.find((account) => account.id === id)?.name ?? null) : null;
}

export function goesNegative(account: Pick<Account, 'archived' | 'projectedMonthEndCents'>): boolean {
  return !account.archived && account.projectedMonthEndCents < 0;
}

export function describeProjection(account: Pick<Account, 'archived' | 'balanceCents' | 'projectedMonthEndCents'>): string | null {
  if (!goesNegative(account)) {
    return null;
  }
  return account.balanceCents < 0
    ? `Ce compte est déjà à découvert et finirait le mois à ${formatCents(account.projectedMonthEndCents)}. Alimentez-le ou vérifiez les paiements prévus.`
    : `Ce compte passerait sous zéro avant la fin du mois (${formatCents(account.projectedMonthEndCents)}). Alimentez-le ou vérifiez les paiements prévus.`;
}

export function describeTransactionCount(count: number): string {
  return count === 0 ? 'Aucune opération' : count === 1 ? '1 opération' : `${count} opérations`;
}

export const DELETE_REFUSED_MESSAGE =
  'Ce compte contient encore des opérations ou des paiements récurrents : archivez-le plutôt, son historique sera conservé.';

export function describeDeleteError(status: number | null): string {
  return status === 400 ? DELETE_REFUSED_MESSAGE : 'Suppression impossible pour le moment, réessayez dans un instant.';
}
