import { Bloc } from './bloc';

export type TransactionKind = 'INCOME' | 'EXPENSE';

export interface Transaction {
  id: string;
  spaceId: string;
  kind: TransactionKind;
  bloc: Bloc | null;
  label: string;
  amountCents: number;
  date: string;
  /** Compte bancaire rattaché (`null` ou absent : aucun). */
  accountId?: string | null;
}

export interface TransactionPayload {
  kind: TransactionKind;
  bloc?: Bloc;
  label: string;
  amountCents: number;
  date: string;
  /** Absent : non précisé ; `null` : détacher du compte. */
  accountId?: string | null;
}

export interface Plan {
  incomeCents: number;
  fixeCents: number;
  courantCents: number;
  plaisirCents: number;
  epargneCents: number;
}

export interface FigureGap {
  plannedCents: number;
  actualCents: number;
  gapCents: number;
}

export interface BlocFigure extends FigureGap {
  bloc: Bloc;
}

export interface Summary {
  month: string;
  income: FigureGap;
  blocs: BlocFigure[];
  plannedBalanceCents: number;
  actualBalanceCents: number;
  savingsRate: number | null;
}

export const PLAN_BLOC_FIELDS: Record<Bloc, keyof Plan> = {
  FIXE: 'fixeCents',
  COURANT: 'courantCents',
  PLAISIR: 'plaisirCents',
  EPARGNE: 'epargneCents',
};

export const EMPTY_PLAN: Plan = { incomeCents: 0, fixeCents: 0, courantCents: 0, plaisirCents: 0, epargneCents: 0 };

export type PlanBalanceStatus = 'unassigned' | 'balanced' | 'overcommitted';

export interface PlanTotals {
  blocsCents: number;
  balanceCents: number;
  status: PlanBalanceStatus;
}

export function planTotals(plan: Plan): PlanTotals {
  const blocsCents = plan.fixeCents + plan.courantCents + plan.plaisirCents + plan.epargneCents;
  const balanceCents = plan.incomeCents - blocsCents;
  const status = balanceCents > 0 ? 'unassigned' : balanceCents < 0 ? 'overcommitted' : 'balanced';
  return { blocsCents, balanceCents, status };
}

export type BlocGapKind = 'none' | 'over' | 'remaining' | 'shortfall' | 'reached';

export interface BlocGap {
  kind: BlocGapKind;
  amountCents: number;
}

export function describeBlocGap(figure: BlocFigure): BlocGap {
  if (figure.plannedCents === 0 && figure.actualCents === 0) {
    return { kind: 'none', amountCents: 0 };
  }
  if (figure.bloc === 'EPARGNE') {
    return figure.gapCents < 0
      ? { kind: 'shortfall', amountCents: -figure.gapCents }
      : { kind: 'reached', amountCents: figure.gapCents };
  }
  return figure.gapCents > 0
    ? { kind: 'over', amountCents: figure.gapCents }
    : { kind: 'remaining', amountCents: -figure.gapCents };
}

export function fillRatio(figure: FigureGap): number {
  if (figure.plannedCents <= 0) {
    return figure.actualCents > 0 ? 1 : 0;
  }
  return Math.min(Math.max(figure.actualCents / figure.plannedCents, 0), 1);
}

export function hasPlan(summary: Summary): boolean {
  return summary.income.plannedCents > 0 || summary.blocs.some((figure) => figure.plannedCents > 0);
}
