import { formatCents, parseAmountToCents } from './money';
import { formatLongDateInput } from './month';

export const AIDS_DISCLAIMER =
  'Les règles et plafonds sont ceux publiés à la date de vérification indiquée ; les montants affichés sont calculés à partir de vos paiements récurrents. En cas de doute, consultez la source officielle ou votre centre des impôts.';

export interface AidRule {
  id: string;
  label: string;
  description: string;
  ratePercent: number;
  capDescription: string;
  cashTiming: string;
  sourceLabel: string;
  sourceUrl: string;
  verifiedOn: string;
}

export interface FiscalProfile {
  childrenUnderSix: number;
  dependentChildren: number;
  firstYearHomeServices: boolean;
}

export interface AidLine {
  recurringId: string;
  label: string;
  yearlySpentCents: number;
  monthlyCents: number;
  netMonthlyCents: number;
}

export interface AidRuleSummary {
  ruleId: string;
  label: string;
  ratePercent: number;
  spentCents: number;
  capCents: number;
  eligibleCents: number;
  expectedCreditCents: number;
  capReached: boolean;
  cashTiming: string;
  sourceUrl: string;
  verifiedOn: string;
  lines: AidLine[];
}

export interface AidsSummary {
  year: number;
  profileMissing: boolean;
  rules: AidRuleSummary[];
  totalExpectedCreditCents: number;
}

export interface CrecheEstimate {
  kind: 'COLLECTIVE';
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

export interface CrecheQuery {
  annualResourcesCents: number;
  children: number;
  hoursPerMonth: number;
  kind: 'COLLECTIVE';
}

// ---------------------------------------------------------------- liens et dates

/** N'accepte que des adresses http(s) : une source venue du serveur ne doit jamais devenir un `javascript:`. */
export function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function describeVerification(verifiedOn: string): string {
  return `vérifié le ${formatLongDateInput(verifiedOn)}`;
}

// ---------------------------------------------------------------- profil fiscal

export const MAX_CHILDREN = 10;

export interface FiscalProfileFormValues {
  childrenUnderSix: string;
  dependentChildren: string;
  firstYearHomeServices: boolean;
}

export interface FiscalProfileFormErrors {
  childrenUnderSix?: string;
  dependentChildren?: string;
}

export type FiscalProfileFormResult =
  | { ok: true; payload: FiscalProfile }
  | { ok: false; errors: FiscalProfileFormErrors };

export function fiscalProfileToForm(profile: FiscalProfile | null): FiscalProfileFormValues {
  return {
    childrenUnderSix: String(profile?.childrenUnderSix ?? 0),
    dependentChildren: String(profile?.dependentChildren ?? 0),
    firstYearHomeServices: profile?.firstYearHomeServices ?? false,
  };
}

function parseChildrenCount(text: string): number | null {
  const value = text.trim();
  if (!/^\d{1,2}$/.test(value)) {
    return null;
  }
  const count = Number(value);
  return count <= MAX_CHILDREN ? count : null;
}

export function buildFiscalProfile(values: FiscalProfileFormValues): FiscalProfileFormResult {
  const errors: FiscalProfileFormErrors = {};
  const childrenUnderSix = parseChildrenCount(values.childrenUnderSix);
  const dependentChildren = parseChildrenCount(values.dependentChildren);
  const message = `Indiquez un nombre entier entre 0 et ${MAX_CHILDREN}.`;
  if (childrenUnderSix === null) {
    errors.childrenUnderSix = message;
  }
  if (dependentChildren === null) {
    errors.dependentChildren = message;
  }
  if (childrenUnderSix === null || dependentChildren === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: { childrenUnderSix, dependentChildren, firstYearHomeServices: values.firstYearHomeServices },
  };
}

// ---------------------------------------------------------------- récapitulatif annuel

export interface CapStatus {
  /** Part du plafond utilisée, entre 0 et 1. */
  ratio: number;
  reached: boolean;
  /** Dépenses qui dépassent le plafond (elles ne donnent plus droit à l'aide). */
  overCapCents: number;
  /** Marge restante avant le plafond. */
  roomCents: number;
}

export function capStatus(rule: Pick<AidRuleSummary, 'spentCents' | 'capCents' | 'capReached'>): CapStatus {
  const overCapCents = Math.max(rule.spentCents - rule.capCents, 0);
  const roomCents = Math.max(rule.capCents - rule.spentCents, 0);
  const ratio = rule.capCents > 0 ? Math.min(rule.spentCents / rule.capCents, 1) : rule.spentCents > 0 ? 1 : 0;
  return { ratio, reached: rule.capReached || overCapCents > 0, overCapCents, roomCents };
}

export function describeCapStatus(rule: Pick<AidRuleSummary, 'spentCents' | 'capCents' | 'capReached'>): string {
  const status = capStatus(rule);
  if (status.reached) {
    return status.overCapCents > 0
      ? `Plafond atteint : ${formatCents(status.overCapCents)} de dépenses au-delà ne donnent plus droit à l’aide.`
      : 'Plafond atteint : les dépenses suivantes ne donneront plus droit à l’aide.';
  }
  return `Il reste ${formatCents(status.roomCents)} de dépenses avant le plafond.`;
}

export function monthlySaving(line: Pick<AidLine, 'monthlyCents' | 'netMonthlyCents'>): number {
  return Math.max(line.monthlyCents - line.netMonthlyCents, 0);
}

export function describeRate(ratePercent: number): string {
  return `${ratePercent} % de crédit d’impôt`;
}

// ---------------------------------------------------------------- estimateur crèche

export const MAX_CRECHE_CHILDREN = 20;
export const MAX_CRECHE_HOURS = 400;

export interface CrecheFormValues {
  annualResources: string;
  children: string;
  hoursPerMonth: string;
}

export interface CrecheFormErrors {
  annualResources?: string;
  children?: string;
  hoursPerMonth?: string;
}

export type CrecheFormResult = { ok: true; query: CrecheQuery } | { ok: false; errors: CrecheFormErrors };

export const EMPTY_CRECHE_FORM: CrecheFormValues = { annualResources: '', children: '1', hoursPerMonth: '' };

export function buildCrecheQuery(values: CrecheFormValues): CrecheFormResult {
  const errors: CrecheFormErrors = {};

  const annualResourcesCents = parseAmountToCents(values.annualResources);
  if (values.annualResources.trim() === '') {
    errors.annualResources = 'Saisissez vos revenus annuels (voir votre avis d’impôt).';
  } else if (annualResourcesCents === null) {
    errors.annualResources = 'Montant invalide : utilisez des chiffres (ex. 42 000).';
  }

  const childrenText = values.children.trim();
  const children = /^\d{1,2}$/.test(childrenText) ? Number(childrenText) : Number.NaN;
  if (!(children >= 1 && children <= MAX_CRECHE_CHILDREN)) {
    errors.children = `Indiquez un nombre d’enfants entre 1 et ${MAX_CRECHE_CHILDREN}.`;
  }

  const hoursText = values.hoursPerMonth.trim().replace(',', '.');
  const hoursPerMonth = /^\d+(?:\.\d{1,2})?$/.test(hoursText) ? Number(hoursText) : Number.NaN;
  if (values.hoursPerMonth.trim() === '') {
    errors.hoursPerMonth = 'Saisissez le nombre d’heures facturées par mois.';
  } else if (!(hoursPerMonth >= 0 && hoursPerMonth <= MAX_CRECHE_HOURS)) {
    errors.hoursPerMonth = `Indiquez un nombre d’heures entre 0 et ${MAX_CRECHE_HOURS}.`;
  }

  if (Object.keys(errors).length > 0 || annualResourcesCents === null) {
    return { ok: false, errors };
  }
  return { ok: true, query: { annualResourcesCents, children, hoursPerMonth, kind: 'COLLECTIVE' } };
}

export function crecheQueryString(query: CrecheQuery): string {
  const params = new URLSearchParams({
    annualResourcesCents: String(query.annualResourcesCents),
    children: String(query.children),
    hoursPerMonth: String(query.hoursPerMonth),
    kind: query.kind,
  });
  return params.toString();
}

const EFFORT_FORMATTER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });

export function formatEffortRate(percent: number): string {
  return `${EFFORT_FORMATTER.format(percent)} %`;
}

export function describeCrecheLimits(estimate: Pick<CrecheEstimate, 'floorApplied' | 'ceilingApplied' | 'floorCents' | 'ceilingCents'>): string | null {
  if (estimate.floorApplied) {
    return `Plancher appliqué : vos ressources sont sous le minimum retenu (${formatCents(estimate.floorCents)} par mois), c’est donc ce minimum qui sert au calcul.`;
  }
  if (estimate.ceilingApplied) {
    return `Plafond appliqué : vos ressources dépassent le maximum retenu (${formatCents(estimate.ceilingCents)} par mois), c’est donc ce maximum qui sert au calcul.`;
  }
  return null;
}
