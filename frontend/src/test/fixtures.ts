import { Account } from '../domain/account';
import { Debt } from '../domain/debt';
import { LifeEvent, LifeEventDefinition, LifeEventStep, withCounts } from '../domain/life-event';
import { Project } from '../domain/project';
import { MonthlyReview, ReviewHistoryItem, ReviewSnapshot } from '../domain/review';
import { PreviewRow } from '../domain/statement-import';

export function previewRow(
  index: number,
  overrides: Partial<PreviewRow> & { target?: PreviewRow['suggestion']['target'] } = {},
): PreviewRow {
  const { target = null, ...rest } = overrides;
  return {
    index,
    date: '2026-10-02T00:00:00.000Z',
    label: `LIBELLE ${index}`,
    amountCents: -1000,
    suggestion: { target, rule: target ? 'regle' : null },
    duplicate: false,
    ...rest,
  };
}

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    spaceId: 's-common',
    name: 'Compte commun',
    kind: 'CHECKING',
    openingBalanceCents: 120000,
    openingDate: '2026-10-01',
    archived: false,
    balanceCents: 98450,
    projectedMonthEndCents: 41200,
    transactionCount: 37,
    ...overrides,
  };
}

export function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    spaceId: 's-common',
    name: 'Vacances été 2027',
    kind: 'HOLIDAY',
    targetCents: 300000,
    targetDate: '2027-07-01',
    startCents: 0,
    startDate: '2026-11-01',
    savedCents: 40000,
    remainingCents: 260000,
    progressPercent: 13,
    monthsLeft: 8,
    monthlyNeededCents: 32500,
    status: 'BEHIND',
    expectedSavedCents: 75000,
    archived: false,
    accountId: null,
    ...overrides,
  };
}

export function reviewSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    incomeCents: 380000,
    expenseCents: 351000,
    balanceCents: 29000,
    savingsRatePercent: 8,
    blocs: [
      { bloc: 'FIXE', plannedCents: 175000, actualCents: 171000, deltaCents: -4000 },
      { bloc: 'COURANT', plannedCents: 100000, actualCents: 140000, deltaCents: 40000 },
      { bloc: 'PLAISIR', plannedCents: 40000, actualCents: 40000, deltaCents: 0 },
      { bloc: 'EPARGNE', plannedCents: 50000, actualCents: 30000, deltaCents: -20000 },
    ],
    topExpenses: [
      { label: 'Courses', amountCents: 142300, count: 9 },
      { label: 'Loyer', amountCents: 120000, count: 1 },
      { label: 'Essence', amountCents: 21000, count: 3 },
    ],
    missingRecurring: [],
    unassignedTransactionCount: 0,
    ...overrides,
  };
}

export function review(overrides: Partial<MonthlyReview> = {}): MonthlyReview {
  return {
    month: '2026-10',
    status: 'TODO',
    answers: { wentWell: '', surprise: '', decision: '' },
    completedAt: null,
    snapshot: reviewSnapshot(),
    ...overrides,
  };
}

export function reviewHistoryItem(overrides: Partial<ReviewHistoryItem> = {}): ReviewHistoryItem {
  return { month: '2026-09', status: 'DONE', decision: 'Fixer 400 € pour les courses', completedAt: '2026-10-03T08:00:00.000Z', ...overrides };
}

export function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    spaceId: 's-common',
    name: 'Prêt auto',
    kind: 'CAR',
    principalCents: 1500000,
    remainingCents: 1120000,
    annualRatePercent: 3.9,
    monthlyPaymentCents: 32000,
    startDate: '2024-09-01',
    paymentDay: 5,
    insuranceMonthlyCents: 1500,
    monthsRemaining: 38,
    payoffDate: '2029-12-05',
    totalInterestRemainingCents: 96000,
    paidSharePercent: 25,
    neverPaidOff: false,
    archived: false,
    recurringId: null,
    ...overrides,
  };
}

/** Par défaut : la déclaration en mairie d'une naissance prévue le 31 octobre 2026, « bientôt due » au 30 octobre 2026. */
export function lifeEventStep(overrides: Partial<LifeEventStep> = {}): LifeEventStep {
  return {
    stepId: 'birth-declaration',
    title: 'Déclarer la naissance à la mairie',
    detail: 'À faire dans les 5 jours qui suivent la naissance (jour de l’accouchement non compté).',
    category: 'ADMIN',
    dueDate: '2026-11-05',
    dueLabel: 'Dans les 5 jours après la naissance',
    status: 'DUE_SOON',
    doneAt: null,
    note: '',
    sourceLabel: 'service-public.gouv.fr',
    sourceUrl: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F961',
    verifiedOn: null,
    link: null,
    ...overrides,
  };
}

/** Cinq démarches, une par groupe sauf « à venir » doublé : en retard, bientôt, à venir, sans échéance, faite. */
export function lifeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return withCounts({
    id: 'e1',
    type: 'BIRTH',
    label: 'Naissance d’un enfant',
    eventDate: '2026-10-31',
    progressPercent: 0,
    doneCount: 0,
    totalCount: 0,
    steps: [
      lifeEventStep({
        stepId: 'birth-pregnancy-declaration',
        title: 'Déclarer la grossesse',
        category: 'SANTE',
        dueDate: '2026-10-15',
        dueLabel: 'Avant la fin du 3e mois de grossesse',
        status: 'OVERDUE',
        sourceUrl: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F968',
      }),
      lifeEventStep(),
      lifeEventStep({
        stepId: 'birth-tax-declaration',
        title: 'Signaler la naissance aux impôts',
        category: 'BUDGET',
        dueDate: '2026-12-30',
        dueLabel: 'Dans les 60 jours après la naissance',
        status: 'UPCOMING',
        sourceLabel: 'impots.gouv.fr',
        sourceUrl: 'https://www.impots.gouv.fr/particulier/questions/jai-eu-un-enfant-quelles-demarches-dois-je-accomplir',
        link: '/previsionnel',
      }),
      lifeEventStep({
        stepId: 'birth-caf-declaration',
        title: 'Déclarer la naissance à la Caf',
        category: 'AIDES',
        dueDate: null,
        dueLabel: 'Dès la naissance',
        status: 'NO_DATE',
        sourceLabel: 'caf.fr',
        sourceUrl: 'https://www.caf.fr/allocataires/caf-du-nord/actualites-departementales/comment-declarer-la-naissance-de-mon-enfant',
        link: '/aides',
      }),
      lifeEventStep({
        stepId: 'birth-family-booklet',
        title: 'Récupérer le livret de famille',
        dueDate: null,
        dueLabel: 'Après la déclaration de naissance',
        status: 'DONE',
        doneAt: '2026-10-28T09:00:00.000Z',
        note: 'Récupéré à la mairie',
      }),
    ],
    ...overrides,
  });
}

export function lifeEventCatalog(): LifeEventDefinition[] {
  return [
    {
      type: 'BIRTH',
      label: 'Naissance d’un enfant',
      description: 'Les démarches et aides à prévoir autour d’une naissance.',
      steps: lifeEvent().steps.map((step) => ({
        id: step.stepId,
        title: step.title,
        detail: step.detail,
        category: step.category,
        dueOffsetDays: step.dueDate === null ? null : 5,
        dueLabel: step.dueLabel,
        sourceLabel: step.sourceLabel,
        sourceUrl: step.sourceUrl,
        verifiedOn: '2026-10-30',
        link: step.link,
      })),
    },
  ];
}
