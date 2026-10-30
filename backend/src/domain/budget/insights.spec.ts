import { rec, tx } from '../../testing/builders';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';
import { RecurringItem } from '../recurring/recurring-item';
import { buildSafetyNetProgress } from '../safety-net/safety-net-coverage';
import { buildForecast } from './forecast';
import { Project, ProjectProps } from '../project/project';
import { ProjectDeposit } from '../project/project-deposit';
import { Riser } from '../trend/trends';
import { ReviewStatus } from '../review/month-review';
import { ProjectView, buildProjectViews } from '../project/project-progress';
import { buildProvisions } from './provisions';
import {
  AccountsInsightContext,
  CommonInsightsContext,
  DebtsInsightContext,
  Insight,
  MAX_INSIGHTS,
  MyContributionStatus,
  buildInsights,
} from './insights';
import { summarizeMonth } from './month-summary';

const nbsp = ' ';
const BALANCED = SpacePlan.create({
  incomeCents: 320000,
  fixeCents: 175000,
  courantCents: 100000,
  plaisirCents: 45000,
  epargneCents: 0,
});

const NO_ACCOUNTS: AccountsInsightContext = {
  accountCount: 0,
  negativeProjected: [],
  unassignedTransactionCount: 0,
};

const NO_DEBTS: DebtsInsightContext = {
  summary: {
    activeCount: 0,
    totalRemainingCents: 0,
    totalMonthlyCents: 0,
    debtToIncomePercent: null,
  },
  monthlyIncomeCents: null,
  neverPaidOff: [],
};

interface Scenario {
  month?: string;
  today?: string;
  plan?: SpacePlan;
  transactions?: Transaction[];
  recurring?: RecurringItem[];
  lastActivity?: Date | null;
  common?: CommonInsightsContext | null;
  accounts?: AccountsInsightContext;
  projects?: ProjectView[];
  previousReview?: { status: ReviewStatus; decision: string } | null;
  debts?: DebtsInsightContext;
  spendingRiser?: Riser | null;
}

function run(scenario: Scenario = {}): Insight[] {
  const month = scenario.month ?? '2026-11';
  const today = new Date(scenario.today ?? '2026-11-20T10:00:00Z');
  const plan = scenario.plan ?? BALANCED;
  const transactions = scenario.transactions ?? [];
  const recurring = scenario.recurring ?? [];
  const lastActivity =
    scenario.lastActivity !== undefined
      ? scenario.lastActivity
      : transactions.length > 0
        ? new Date(Math.max(...transactions.map((t) => t.date.getTime())))
        : null;
  return buildInsights({
    month,
    today,
    plan,
    summary: summarizeMonth(month, plan, transactions),
    forecast: buildForecast({
      month,
      today,
      plan,
      transactions,
      recurring,
      commonSpace: scenario.common !== undefined && scenario.common !== null,
    }),
    lastActivity,
    common: scenario.common ?? null,
    accounts: scenario.accounts ?? NO_ACCOUNTS,
    provisions: buildProvisions(recurring, today),
    projects: scenario.projects ?? [],
    previousReview: scenario.previousReview ?? null,
    debts: scenario.debts ?? NO_DEBTS,
    spendingRiser: scenario.spendingRiser ?? null,
  });
}

const ids = (insights: Insight[]) => insights.map((i) => i.id);
const byId = (insights: Insight[], id: string) =>
  insights.find((i) => i.id === id)!;

const status = (
  currentCents: number,
  targetMonths: number,
  basis = 275000,
) => ({
  ...buildSafetyNetProgress(currentCents, basis),
  targetMonths,
});

const recent = [tx('EXPENSE', 'COURANT', 'Courses', 5000, '2026-11-18')];

describe('buildInsights', () => {
  it('says all-good only when nothing else applies', () => {
    const insights = run({ transactions: recent });
    expect(insights).toEqual([
      expect.objectContaining({
        id: 'all-good',
        severity: 'GOOD',
        lesson: 4,
        link: null,
      }),
    ]);
  });

  it('asks for a plan when none exists', () => {
    const insights = run({ plan: SpacePlan.empty(), transactions: recent });
    expect(ids(insights)).toEqual(['plan-missing']);
    expect(insights[0]).toMatchObject({
      severity: 'ACTION',
      lesson: 1,
      link: '/plan',
    });
  });

  it('flags a plan whose blocs exceed the planned income', () => {
    const plan = SpacePlan.create({
      incomeCents: 300000,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 20000,
    });
    const insight = byId(
      run({ plan, transactions: recent }),
      'plan-overcommitted',
    );
    expect(insight.severity).toBe('WARNING');
    expect(insight.detail).toBe(
      `Les 4 blocs totalisent 3${nbsp}400${nbsp}€ pour 3${nbsp}000${nbsp}€ de revenus prévus : il manque 400${nbsp}€. Réduisez un bloc ou revoyez vos revenus.`,
    );
  });

  it('does not call a plan without planned income overcommitted (common spaces are funded by contributions)', () => {
    const plan = SpacePlan.create({
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 0,
    });
    expect(ids(run({ plan, transactions: recent }))).not.toContain(
      'plan-overcommitted',
    );
  });

  it('flags income that is not assigned to any bloc', () => {
    const plan = SpacePlan.create({
      incomeCents: 350050,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 0,
    });
    const insight = byId(
      run({ plan, transactions: recent }),
      'plan-unassigned',
    );
    expect(insight.title).toBe(`300,50${nbsp}€ de revenus non affectés`);
    expect(insight.severity).toBe('ACTION');
  });

  it('warns about a deficit using the projection, not only the actuals', () => {
    const insights = run({
      transactions: [
        tx('INCOME', null, 'Salaire', 100000, '2026-11-02'),
        tx('EXPENSE', 'COURANT', 'Courses', 150000, '2026-11-18'),
      ],
    });
    const deficit = byId(insights, 'month-deficit');
    expect(deficit.severity).toBe('WARNING');
    expect(deficit.title).toBe(`Déficit de 500${nbsp}€ attendu ce mois-ci`);
    // Pas de revenu connu du tout : on ne crie pas au déficit en début de mois.
    expect(
      ids(
        run({
          transactions: [
            tx('EXPENSE', 'COURANT', 'Courses', 5000, '2026-11-18'),
          ],
        }),
      ),
    ).not.toContain('month-deficit');
  });

  it('words the deficit of a past month in the past tense', () => {
    const insights = run({
      month: '2026-10',
      transactions: [
        tx('INCOME', null, 'Salaire', 100000, '2026-10-02'),
        tx('EXPENSE', 'COURANT', 'Courses', 150000, '2026-10-18'),
      ],
    });
    expect(byId(insights, 'month-deficit').title).toBe(
      `Déficit de 500${nbsp}€ en octobre 2026`,
    );
  });

  it('flags each overrun bloc (never EPARGNE)', () => {
    const insights = run({
      plan: SpacePlan.create({
        incomeCents: 320000,
        fixeCents: 100000,
        courantCents: 100000,
        plaisirCents: 45000,
        epargneCents: 75000,
      }),
      transactions: [
        tx('EXPENSE', 'PLAISIR', 'Restaurant', 50000, '2026-11-10'),
        tx('EXPENSE', 'FIXE', 'Loyer', 110000, '2026-11-05'),
        tx('EXPENSE', 'EPARGNE', 'Livret', 90000, '2026-11-06'),
        tx('INCOME', null, 'Salaire', 320000, '2026-11-02'),
      ],
    });
    expect(ids(insights).filter((id) => id.startsWith('bloc-overrun'))).toEqual(
      ['bloc-overrun-FIXE', 'bloc-overrun-PLAISIR'],
    );
    expect(byId(insights, 'bloc-overrun-PLAISIR')).toMatchObject({
      severity: 'WARNING',
      title: `Bloc Plaisir dépassé de 50${nbsp}€`,
      lesson: 1,
      link: '/plan',
    });
    expect(byId(insights, 'bloc-overrun-PLAISIR').title).toBe(
      `Bloc Plaisir dépassé de 50${nbsp}€`,
    );
    expect(byId(insights, 'bloc-overrun-FIXE').title).toBe(
      `Bloc Fixe dépassé de 100${nbsp}€`,
    );
  });

  describe('recurring payments', () => {
    const items = [
      rec('EXPENSE', 'FIXE', 'Loyer', 110000, { dayOfMonth: 5 }),
      rec('EXPENSE', 'FIXE', 'Assurance', 4500, { dayOfMonth: 8 }),
    ];

    it('lists the missing ones with the wording of the contract', () => {
      const insight = byId(
        run({ today: '2026-11-12T08:00:00Z', recurring: items }),
        'recurring-missing',
      );
      expect(insight).toEqual({
        id: 'recurring-missing',
        severity: 'ACTION',
        title: '2 paiements récurrents introuvables',
        detail:
          'Loyer (5 nov.) et Assurance (8 nov.) sont attendus mais absents des opérations. Importez votre relevé.',
        lesson: 4,
        link: '/import',
      });
    });

    it('uses the singular for a single missing payment and truncates long lists', () => {
      const one = byId(
        run({ today: '2026-11-06T08:00:00Z', recurring: items }),
        'recurring-missing',
      );
      expect(one.title).toBe('1 paiement récurrent introuvable');
      expect(one.detail).toBe(
        'Loyer (5 nov.) est attendu mais absent des opérations. Importez votre relevé.',
      );

      const many = Array.from({ length: 5 }, (_, i) =>
        rec('EXPENSE', 'FIXE', `Poste ${i + 1}`, 1000, { dayOfMonth: i + 1 }),
      );
      const detail = byId(
        run({ today: '2026-11-12T08:00:00Z', recurring: many }),
        'recurring-missing',
      ).detail;
      expect(detail).toBe(
        'Poste 1 (1 nov.), Poste 2 (2 nov.), Poste 3 (3 nov.) et 2 autres sont attendus mais absents des opérations. Importez votre relevé.',
      );
    });

    it('does not flag a payment found in the statement', () => {
      const insights = run({
        today: '2026-11-12T08:00:00Z',
        recurring: items,
        transactions: [
          tx('EXPENSE', 'FIXE', 'PRLV LOYER', 110000, '2026-11-05'),
          tx('EXPENSE', 'FIXE', 'ASSURANCE HABITATION', 4500, '2026-11-08'),
        ],
      });
      expect(ids(insights)).not.toContain('recurring-missing');
    });

    it('announces expenses due in the next 7 days only', () => {
      const upcoming = [
        rec('EXPENSE', 'FIXE', 'Aujourd hui', 1000, { dayOfMonth: 12 }),
        rec('EXPENSE', 'FIXE', 'Dans sept jours', 2000, { dayOfMonth: 19 }),
        rec('EXPENSE', 'FIXE', 'Dans huit jours', 4000, { dayOfMonth: 20 }),
        rec('INCOME', null, 'Salaire', 300000, { dayOfMonth: 14 }),
      ];
      const insight = byId(
        run({
          today: '2026-11-12T08:00:00Z',
          recurring: upcoming,
          transactions: [tx('INCOME', null, 'Autre', 1000, '2026-11-11')],
        }),
        'upcoming-payments',
      );
      expect(insight.severity).toBe('INFO');
      expect(insight.title).toBe('2 paiements à venir dans les 7 jours');
      expect(insight.detail).toBe(
        `Aujourd hui (12 nov., 10${nbsp}€) et Dans sept jours (19 nov., 20${nbsp}€). Total : 30${nbsp}€. Gardez ce montant disponible.`,
      );
    });
  });

  describe('recent activity', () => {
    it('flags more than 10 days without any operation', () => {
      const stale = (last: string) =>
        run({
          today: '2026-11-12T08:00:00Z',
          transactions: [],
          lastActivity: new Date(`${last}T22:00:00Z`),
        });
      expect(byId(stale('2026-11-01'), 'no-recent-activity').title).toBe(
        'Aucune opération depuis 11 jours',
      );
      expect(ids(stale('2026-11-02'))).not.toContain('no-recent-activity');
    });

    it('asks for a first import when the space has no operation at all', () => {
      const insight = byId(run({ lastActivity: null }), 'no-recent-activity');
      expect(insight).toMatchObject({
        severity: 'ACTION',
        lesson: 4,
        link: '/import',
      });
    });

    it('does not apply to a past month', () => {
      expect(ids(run({ month: '2026-10', lastActivity: null }))).not.toContain(
        'no-recent-activity',
      );
    });
  });

  describe('monthly review', () => {
    it('invites to review the previous month during the first week', () => {
      const insight = byId(
        run({ today: '2026-11-04T08:00:00Z', transactions: recent }),
        'monthly-review',
      );
      expect(insight.title).toBe('Faites le bilan de octobre 2026');
      expect(insight.severity).toBe('INFO');
    });

    it('summarises the previous month when it is the one consulted', () => {
      const insight = byId(
        run({
          month: '2026-10',
          today: '2026-11-04T08:00:00Z',
          transactions: [
            tx('INCOME', null, 'Salaire', 320000, '2026-10-02'),
            tx('EXPENSE', 'FIXE', 'Loyer', 110000, '2026-10-05'),
          ],
        }),
        'monthly-review',
      );
      expect(insight.title).toBe('Bilan de octobre 2026');
      expect(insight.detail).toContain(`Revenus 3${nbsp}200${nbsp}€`);
      expect(insight.detail).toContain(`dépenses 1${nbsp}100${nbsp}€`);
      expect(insight.detail).toContain(`solde de 2${nbsp}100${nbsp}€`);
    });

    it('stays silent after the first week and for other months', () => {
      expect(
        ids(run({ today: '2026-11-08T08:00:00Z', transactions: recent })),
      ).not.toContain('monthly-review');
      expect(
        ids(run({ month: '2026-09', today: '2026-11-04T08:00:00Z' })),
      ).not.toContain('monthly-review');
    });

    it('handles the year boundary', () => {
      const insight = byId(
        run({
          month: '2027-01',
          today: '2027-01-03T08:00:00Z',
          transactions: [tx('EXPENSE', 'COURANT', 'x', 100, '2027-01-02')],
        }),
        'monthly-review',
      );
      expect(insight.title).toBe('Faites le bilan de décembre 2026');
    });
  });

  describe('savings', () => {
    const plan = SpacePlan.create({
      incomeCents: 320000,
      fixeCents: 155000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 20000,
    });

    it('is on track once the planned amount is saved', () => {
      const insights = run({
        plan,
        transactions: [
          tx('EXPENSE', 'EPARGNE', 'Virement livret', 20000, '2026-11-02'),
        ],
      });
      expect(byId(insights, 'savings-on-track')).toMatchObject({
        severity: 'GOOD',
        lesson: 1,
      });
      expect(ids(insights)).not.toContain('savings-behind');
    });

    it('counts a scheduled recurring saving as on track', () => {
      const insights = run({
        plan,
        transactions: recent,
        recurring: [
          rec('EXPENSE', 'EPARGNE', 'Virement livret', 20000, {
            dayOfMonth: 28,
          }),
        ],
      });
      expect(ids(insights)).toContain('savings-on-track');
    });

    it('is behind when less than planned is saved or scheduled', () => {
      const insights = run({
        plan,
        transactions: [
          tx('EXPENSE', 'EPARGNE', 'Virement livret', 5000, '2026-11-02'),
        ],
      });
      const behind = byId(insights, 'savings-behind');
      expect(behind.severity).toBe('ACTION');
      expect(behind.detail).toContain(`il manque 150${nbsp}€`);
    });

    it('says nothing for a future month or without a savings plan', () => {
      expect(
        ids(run({ plan, month: '2027-01', transactions: recent })),
      ).not.toEqual(expect.arrayContaining(['savings-behind']));
      expect(ids(run({ transactions: recent }))).not.toEqual(
        expect.arrayContaining(['savings-behind', 'savings-on-track']),
      );
    });
  });

  describe('common space', () => {
    const common = (over: Partial<CommonInsightsContext> = {}) => ({
      safetyNet: null,
      contributionIncomplete: false,
      myContribution: null,
      ...over,
    });

    it('asks to declare the safety net', () => {
      const insights = run({ transactions: recent, common: common() });
      expect(byId(insights, 'safety-net-unset')).toMatchObject({
        severity: 'INFO',
        lesson: 2,
        link: '/foyer',
      });
    });

    it('measures the safety net in months of essential spending', () => {
      const insight = byId(
        run({
          transactions: recent,
          common: common({
            safetyNet: status(700000, 6),
          }),
        }),
        'safety-net-progress',
      );
      // 700 000 / 275 000 = 2,54 : arrondi par défaut à 2,5 mois.
      expect(insight.severity).toBe('INFO');
      expect(insight.title).toBe('Épargne de sécurité : 2,5 mois sur 6');
      expect(insight.detail).toBe(
        `Votre réserve de 7${nbsp}000${nbsp}€ couvre 2,5 mois de dépenses essentielles (2${nbsp}750${nbsp}€ par mois). Il manque 9${nbsp}500${nbsp}€ pour atteindre 6 mois.`,
      );
    });

    it('turns green once the target is reached', () => {
      const reached = byId(
        run({
          transactions: recent,
          common: common({
            safetyNet: status(1650000, 6),
          }),
        }),
        'safety-net-progress',
      );
      expect(reached.severity).toBe('GOOD');
      expect(reached.title).toBe('Épargne de sécurité : 6 mois sur 6');
      expect(reached.detail).toContain("l'objectif de 6 mois est atteint");
    });

    it('does not claim the target before it is really reached', () => {
      const almost = byId(
        run({
          transactions: recent,
          common: common({
            safetyNet: status(1649999, 6),
          }),
        }),
        'safety-net-progress',
      );
      expect(almost.severity).toBe('INFO');
      expect(almost.title).toBe('Épargne de sécurité : 5,9 mois sur 6');
    });

    it('falls back to the raw amount when no spending reference is known', () => {
      const insight = byId(
        run({
          transactions: recent,
          common: common({
            safetyNet: status(500000, 3, 0),
          }),
        }),
        'safety-net-progress',
      );
      expect(insight.title).toBe(
        `Épargne de sécurité : 5${nbsp}000${nbsp}€ de côté`,
      );
    });

    it('flags an incomplete household contribution', () => {
      const insights = run({
        transactions: recent,
        common: common({ contributionIncomplete: true }),
      });
      expect(byId(insights, 'contribution-incomplete')).toMatchObject({
        severity: 'ACTION',
        link: '/foyer',
      });
    });

    it('never produces safety-net or contribution insights for a personal space', () => {
      const personal = run({ transactions: recent, common: null });
      expect(
        ids(personal).filter(
          (id) => id.startsWith('safety-net') || id.startsWith('contribution'),
        ),
      ).toEqual([]);
    });
  });

  describe('contribution-pending', () => {
    const mine = (
      status: MyContributionStatus['status'],
      paidCents: number,
      expectedCents: number | null = 175000,
    ): MyContributionStatus => ({
      status,
      expectedCents,
      paidCents,
      remainingCents:
        expectedCents === null ? null : Math.max(0, expectedCents - paidCents),
    });
    const withMine = (
      myContribution: MyContributionStatus | null,
      over: Partial<CommonInsightsContext> = {},
    ): CommonInsightsContext => ({
      safetyNet: status(700000, 6),
      contributionIncomplete: false,
      myContribution,
      ...over,
    });
    const pending = (insights: Insight[]) =>
      insights.filter((i) => i.id === 'contribution-pending');

    it('asks me to pay a contribution that has not been paid at all', () => {
      const insights = run({
        transactions: recent,
        common: withMine(mine('PENDING', 0)),
      });
      expect(pending(insights)).toEqual([
        {
          id: 'contribution-pending',
          severity: 'ACTION',
          title: `Contribution de novembre 2026 : 1${nbsp}750${nbsp}€ à verser`,
          detail: `Vous n'avez encore rien versé au budget commun pour novembre 2026 : 1${nbsp}750${nbsp}€ attendus. Enregistrez votre versement une fois fait.`,
          lesson: null,
          link: '/foyer',
        },
      ]);
    });

    it('states what is left to pay when the contribution is partial', () => {
      const [insight] = pending(
        run({
          transactions: recent,
          common: withMine(mine('PARTIAL', 120000)),
        }),
      );
      expect(insight.title).toBe(
        `Contribution de novembre 2026 : 550${nbsp}€ à verser`,
      );
      expect(insight.detail).toBe(
        `Vous avez versé 1${nbsp}200${nbsp}€ sur 1${nbsp}750${nbsp}€ attendus pour le budget commun : il reste 550${nbsp}€ à verser. Enregistrez votre versement une fois fait.`,
      );
      expect(insight.link).toBe('/foyer');
    });

    it('waits for the 6th of the month', () => {
      const common = withMine(mine('PENDING', 0));
      expect(
        pending(
          run({
            today: '2026-11-05T23:00:00Z',
            transactions: recent,
            common,
          }),
        ),
      ).toEqual([]);
      expect(
        pending(
          run({ today: '2026-11-06T00:30:00Z', transactions: recent, common }),
        ),
      ).toHaveLength(1);
    });

    it('is only raised for the current month', () => {
      const common = withMine(mine('PENDING', 0));
      for (const month of ['2026-10', '2026-12']) {
        expect(pending(run({ month, transactions: recent, common }))).toEqual(
          [],
        );
      }
    });

    it('stays silent once paid, overpaid, or when nothing is expected', () => {
      for (const contribution of [
        mine('PAID', 175000),
        mine('OVERPAID', 180000),
        mine('NONE', 0, 0),
        mine('UNKNOWN', 0, null),
        null,
      ]) {
        expect(
          pending(
            run({ transactions: recent, common: withMine(contribution) }),
          ),
        ).toEqual([]);
      }
    });

    it('gives no advice when the household rule cannot be computed', () => {
      const insights = run({
        transactions: recent,
        common: withMine(mine('PENDING', 0), { contributionIncomplete: true }),
      });
      expect(pending(insights)).toEqual([]);
      expect(ids(insights)).toContain('contribution-incomplete');
    });

    it('never exists for a personal space', () => {
      expect(pending(run({ transactions: recent, common: null }))).toEqual([]);
    });

    it('ranks among ACTION insights right after contribution-incomplete, before savings-behind', () => {
      const insights = run({
        transactions: recent,
        plan: SpacePlan.create({
          incomeCents: 0,
          fixeCents: 175000,
          courantCents: 100000,
          plaisirCents: 45000,
          epargneCents: 20000,
        }),
        common: withMine(mine('PENDING', 0)),
      });
      const order = ids(insights);
      expect(order).toContain('contribution-pending');
      expect(order).toContain('savings-behind');
      expect(order.indexOf('contribution-pending')).toBeLessThan(
        order.indexOf('savings-behind'),
      );
    });
  });

  describe('common space funded by contributions', () => {
    const COMMON_PLAN = SpacePlan.create({
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 0,
    });
    const common: CommonInsightsContext = {
      safetyNet: status(700000, 6),
      contributionIncomplete: false,
      myContribution: null,
    };

    it('raises no false deficit, overcommitment or unassigned income on an unfunded plan', () => {
      const insights = run({
        plan: COMMON_PLAN,
        transactions: [tx('EXPENSE', 'COURANT', 'Courses', 5000, '2026-11-18')],
        common,
      });
      const found = ids(insights);
      for (const id of [
        'month-deficit',
        'plan-overcommitted',
        'plan-unassigned',
        'plan-missing',
      ]) {
        expect(found).not.toContain(id);
      }
    });

    it('still warns when the common space really overspends its plan', () => {
      const insights = run({
        plan: COMMON_PLAN,
        transactions: [
          tx('EXPENSE', 'COURANT', 'Courses', 400000, '2026-11-18'),
        ],
        common,
      });
      // Contributions supposées 320 000, dépenses 400 000 : déficit de 800 €.
      expect(byId(insights, 'month-deficit').title).toBe(
        `Déficit de 800${nbsp}€ attendu ce mois-ci`,
      );
    });

    it('would have flagged the same plan as a deficit in a personal space', () => {
      const insights = run({
        plan: COMMON_PLAN,
        transactions: [
          tx('INCOME', null, 'Petit revenu', 1000, '2026-11-01'),
          tx('EXPENSE', 'COURANT', 'Courses', 5000, '2026-11-18'),
        ],
      });
      expect(ids(insights)).toContain('month-deficit');
    });
  });

  describe('accounts', () => {
    const accounts = (over: Partial<AccountsInsightContext> = {}) => ({
      accountCount: 2,
      negativeProjected: [],
      unassignedTransactionCount: 0,
      ...over,
    });

    it('warns about an account projected below zero (current month only)', () => {
      const insight = byId(
        run({
          transactions: recent,
          accounts: accounts({
            negativeProjected: [
              { name: 'Compte commun', projectedMonthEndCents: -12050 },
            ],
          }),
        }),
        'account-negative-projected',
      );
      expect(insight).toEqual({
        id: 'account-negative-projected',
        severity: 'WARNING',
        title: 'Compte commun passerait sous zéro',
        detail: `Solde prévu en fin de mois : -120,50${nbsp}€. Approvisionnez ce compte ou décalez une dépense.`,
        lesson: 4,
        link: '/comptes',
      });
      for (const month of ['2026-10', '2027-01']) {
        expect(
          ids(
            run({
              month,
              transactions: recent,
              accounts: accounts({
                negativeProjected: [
                  { name: 'Compte commun', projectedMonthEndCents: -1 },
                ],
              }),
            }),
          ),
        ).not.toContain('account-negative-projected');
      }
    });

    it('groups several accounts and names the lowest balance', () => {
      const insight = byId(
        run({
          transactions: recent,
          accounts: accounts({
            negativeProjected: [
              { name: 'Courant', projectedMonthEndCents: -500 },
              { name: 'Livret', projectedMonthEndCents: -20000 },
            ],
          }),
        }),
        'account-negative-projected',
      );
      expect(insight.title).toBe('2 comptes passeraient sous zéro');
      expect(insight.detail).toBe(
        `Courant et Livret : le plus bas serait à -200${nbsp}€ en fin de mois. Approvisionnez ces comptes ou décalez une dépense.`,
      );
    });

    it('invites to attach unassigned operations, only when the space has an account', () => {
      const one = byId(
        run({
          transactions: recent,
          accounts: accounts({ unassignedTransactionCount: 1 }),
        }),
        'accounts-unassigned',
      );
      expect(one).toMatchObject({
        severity: 'INFO',
        title: '1 opération sans compte',
        link: '/comptes',
      });
      expect(
        byId(
          run({
            transactions: recent,
            accounts: accounts({ unassignedTransactionCount: 12 }),
          }),
          'accounts-unassigned',
        ).title,
      ).toBe('12 opérations sans compte');
      expect(
        ids(
          run({
            transactions: recent,
            accounts: accounts({
              accountCount: 0,
              unassignedTransactionCount: 12,
              negativeProjected: [{ name: 'x', projectedMonthEndCents: -1 }],
            }),
          }),
        ),
      ).toEqual(['all-good']);
    });

    it('ranks the negative balance among the warnings and keeps all-good out', () => {
      const insights = run({
        transactions: recent,
        plan: SpacePlan.empty(),
        accounts: accounts({
          negativeProjected: [{ name: 'Courant', projectedMonthEndCents: -1 }],
          unassignedTransactionCount: 3,
        }),
      });
      expect(ids(insights)).toEqual([
        'account-negative-projected',
        'plan-missing',
        'accounts-unassigned',
      ]);
    });
  });

  describe('non-monthly payments', () => {
    const yearly = (label: string, cents: number, month: number, day: number) =>
      rec('EXPENSE', 'FIXE', label, cents, {
        frequency: 'YEARLY',
        monthOfYear: month,
        dayOfMonth: day,
      });
    const TODAY = '2026-11-12T08:00:00Z';
    const plan = (income: number, epargne = 20000) =>
      SpacePlan.create({
        incomeCents: income,
        fixeCents: income - 100000 - epargne,
        courantCents: 70000,
        plaisirCents: 30000,
        epargneCents: epargne,
      });

    it('announces a big non-monthly payment within 60 days, with the monthly provision', () => {
      const insight = byId(
        run({
          today: TODAY,
          plan: plan(320000),
          transactions: recent,
          recurring: [yearly('Taxe foncière', 120000, 11, 15)],
        }),
        'upcoming-big-payment',
      );
      expect(insight).toEqual({
        id: 'upcoming-big-payment',
        severity: 'INFO',
        title: 'Gros paiement à venir : Taxe foncière',
        detail: `Taxe foncière (15 nov.) : 1${nbsp}200${nbsp}€. Mettez 100${nbsp}€ par mois de côté pour le lisser.`,
        lesson: 1,
        link: '/previsionnel',
      });
    });

    it('uses the 60-day window (inclusive) and the 500 € floor', () => {
      const at = (month: number, day: number, cents = 120000) =>
        ids(
          run({
            today: TODAY,
            plan: plan(320000),
            transactions: recent,
            recurring: [yearly('Taxe', cents, month, day)],
          }),
        ).includes('upcoming-big-payment');
      // 12 novembre + 60 jours = 11 janvier.
      expect(at(1, 11)).toBe(true);
      expect(at(1, 12)).toBe(false);
      expect(at(11, 11)).toBe(false); // hier : prochaine échéance dans un an
      expect(at(11, 12)).toBe(true); // aujourd'hui
      expect(at(11, 20, 50000)).toBe(true); // 500 € exactement
      expect(at(11, 20, 49999)).toBe(false); // sous 500 € et < 20 % de 3 200 €
    });

    it('also triggers from 20 % of the known monthly income, boundary included', () => {
      const at = (income: number) =>
        ids(
          run({
            today: TODAY,
            plan: plan(income),
            transactions: recent,
            recurring: [yearly('Taxe', 40000, 11, 20)],
          }),
        ).includes('upcoming-big-payment');
      expect(at(200000)).toBe(true); // 400 € = 20 % de 2 000 €
      expect(at(201000)).toBe(false);
      expect(at(150000)).toBe(true);
    });

    it('ignores monthly payments, incomes, a payment already found and other months', () => {
      const bonus = rec('INCOME', null, 'Prime', 900000, {
        frequency: 'YEARLY',
        monthOfYear: 11,
        dayOfMonth: 20,
      });
      const big = (over: Scenario = {}) =>
        ids(
          run({
            today: TODAY,
            plan: plan(320000),
            transactions: recent,
            recurring: [
              bonus,
              rec('EXPENSE', 'FIXE', 'Loyer', 110000, { dayOfMonth: 20 }),
            ],
            ...over,
          }),
        ).includes('upcoming-big-payment');
      expect(big()).toBe(false);
      const taxe = yearly('Taxe foncière', 120000, 11, 20);
      expect(big({ recurring: [taxe] })).toBe(true);
      // Déjà retrouvée dans les opérations : plus « à venir ».
      expect(
        big({
          recurring: [taxe],
          transactions: [
            ...recent,
            tx('EXPENSE', 'FIXE', 'TAXE FONCIERE', 118000, '2026-11-10'),
          ],
        }),
      ).toBe(false);
      expect(big({ recurring: [taxe], month: '2026-10' })).toBe(false);
      expect(big({ recurring: [taxe], month: '2026-12' })).toBe(false);
    });

    it('groups several big payments and lists at most three', () => {
      const insight = byId(
        run({
          today: TODAY,
          plan: plan(320000),
          transactions: recent,
          recurring: [
            yearly('Taxe foncière', 120000, 11, 15),
            yearly('Impôt', 240000, 11, 20),
            yearly('Vacances', 90000, 12, 1),
            yearly('Assurance', 60000, 12, 5),
          ],
        }),
        'upcoming-big-payment',
      );
      expect(insight.title).toBe('4 gros paiements à venir');
      // 10 000 + 20 000 + 7 500 + 5 000 = 42 500 par mois.
      expect(insight.detail).toBe(
        `Taxe foncière (1${nbsp}200${nbsp}€, 15 nov.), Impôt (2${nbsp}400${nbsp}€, 20 nov.), Vacances (900${nbsp}€, 1 déc.) et 1 autre. Provision conseillée : 425${nbsp}€ par mois au total.`,
      );
    });

    it('suggests a provision when the planned savings do not cover it', () => {
      const run_ = (
        epargne: number,
        recurring = [yearly('Taxe foncière', 120000, 3, 15)],
      ) =>
        run({
          today: TODAY,
          plan: plan(320000, epargne),
          transactions: recent,
          recurring,
        });
      // 120 000 / 12 = 100 € par mois.
      const insight = byId(run_(5000), 'provision-suggestion');
      expect(insight).toEqual({
        id: 'provision-suggestion',
        severity: 'INFO',
        title: 'Provisionnez vos paiements non mensuels',
        detail: `Vos paiements non mensuels demandent 100${nbsp}€ par mois à mettre de côté, mais le bloc Épargne de votre plan n'en prévoit que 50${nbsp}€. Relevez-le d'au moins 50${nbsp}€.`,
        lesson: 1,
        link: '/plan',
      });
      expect(ids(run_(10000))).not.toContain('provision-suggestion'); // égalité : couvert
      expect(ids(run_(20000))).not.toContain('provision-suggestion');
      expect(ids(run_(0, []))).not.toContain('provision-suggestion'); // rien de non mensuel
      expect(
        ids(run_(0, [rec('EXPENSE', 'FIXE', 'Loyer', 110000)])),
      ).not.toContain('provision-suggestion');
    });

    it('sums the provisions of several payments, rounded up, and ignores incomes', () => {
      const insight = byId(
        run({
          today: TODAY,
          plan: plan(320000, 0),
          transactions: recent,
          recurring: [
            yearly('Taxe foncière', 120001, 3, 15), // 10 001
            rec('EXPENSE', 'FIXE', 'Assurance', 100, {
              frequency: 'QUARTERLY',
              monthOfYear: 2,
            }), // 34
            rec('INCOME', null, 'Prime', 900000, {
              frequency: 'YEARLY',
              monthOfYear: 12,
            }),
          ],
        }),
        'provision-suggestion',
      );
      expect(insight.detail).toContain(`demandent 100,35${nbsp}€ par mois`);
    });
  });

  describe('savings projects', () => {
    const TODAY = '2026-11-20T10:00:00Z';
    const project = (over: Partial<ProjectProps> = {}) =>
      Project.create({
        id: 'p1',
        spaceId: 'common',
        name: 'Vacances',
        kind: 'HOLIDAY',
        targetCents: 300000,
        targetDate: '2027-07-01',
        startCents: 0,
        startDate: '2026-11-01',
        archived: false,
        accountId: null,
        ...over,
      });
    let n = 0;
    const deposit = (date: string, cents: number, projectId = 'p1') =>
      ProjectDeposit.create({
        id: `d${(n += 1)}`,
        projectId,
        spaceId: 'common',
        date,
        amountCents: cents,
        note: '',
      });
    const views = (
      projects: Project[],
      deposits: ProjectDeposit[] = [],
    ): ProjectView[] => buildProjectViews(projects, deposits, new Date(TODAY));
    const withProjects = (
      projects: Project[],
      deposits: ProjectDeposit[] = [],
      over: Scenario = {},
    ) =>
      run({
        today: TODAY,
        plan: SpacePlan.create({
          incomeCents: 320000,
          fixeCents: 125000,
          courantCents: 100000,
          plaisirCents: 45000,
          epargneCents: 50000,
        }),
        transactions: recent,
        projects: views(projects, deposits),
        ...over,
      });

    it('warns about a project behind its linear pace, with the delay and the monthly amount', () => {
      // Le 20 novembre : 19 jours sur 242 -> attendu 23 554 ; rien épargné ; 7 mois restants.
      const insight = byId(withProjects([project()]), 'project-behind');
      expect(insight).toEqual({
        id: 'project-behind',
        severity: 'WARNING',
        title: 'Projet en retard : Vacances',
        // ceil(300 000 / 7) = 42 858
        detail: `Vacances : 235,54${nbsp}€ de retard. Versement mensuel conseillé : 428,58${nbsp}€.`,
        lesson: 1,
        link: '/projets',
      });
    });

    it('also warns about a project whose deadline has passed', () => {
      const late = project({
        targetCents: 100000,
        startDate: '2026-01-01',
        targetDate: '2026-11-10',
      });
      const insight = byId(
        withProjects([late], [deposit('2026-05-01', 30000)]),
        'project-behind',
      );
      expect(insight.detail).toBe(
        `Vacances : 700${nbsp}€ de retard (l'échéance est dépassée). Versement mensuel conseillé : 700${nbsp}€.`,
      );
    });

    it('groups several late projects', () => {
      const insight = byId(
        withProjects([
          project(),
          project({ id: 'p2', name: 'Voiture', targetCents: 600000 }),
        ]),
        'project-behind',
      );
      expect(insight.title).toBe('2 projets en retard');
      expect(insight.detail).toContain('Vacances (235,54');
      expect(insight.detail).toContain('Voiture (');
      expect(insight.detail).toContain('Versements mensuels conseillés');
    });

    it('stays silent for projects on track, ahead, done or archived, and for other months', () => {
      const onTrack = project({ targetCents: 100000 });
      // 19 / 242 × 100 000 = 7 851 attendus ; 10 000 épargnés : dans la tolérance.
      expect(
        ids(withProjects([onTrack], [deposit('2026-11-02', 10000)])),
      ).not.toContain('project-behind');
      expect(
        ids(withProjects([project()], [deposit('2026-11-02', 300000)])),
      ).not.toContain('project-behind');
      expect(ids(withProjects([project({ archived: true })]))).not.toContain(
        'project-behind',
      );
      expect(
        ids(withProjects([project()], [], { month: '2026-10' })),
      ).not.toContain('project-behind');
      expect(
        ids(withProjects([project()], [], { month: '2026-12' })),
      ).not.toContain('project-behind');
    });

    it('flags projects that need more per month than the planned savings', () => {
      // 42 858 par mois demandés, 20 000 prévus : il manque 228,58 €.
      const insight = byId(
        withProjects([project()], [], {
          plan: SpacePlan.create({
            incomeCents: 320000,
            fixeCents: 155000,
            courantCents: 100000,
            plaisirCents: 45000,
            epargneCents: 20000,
          }),
        }),
        'projects-exceed-savings',
      );
      expect(insight).toEqual({
        id: 'projects-exceed-savings',
        severity: 'ACTION',
        title: "Vos projets dépassent l'épargne prévue",
        detail: `Vos projets demandent 428,58${nbsp}€ par mois, mais le bloc Épargne de votre plan en prévoit 200${nbsp}€ : il manque 228,58${nbsp}€ par mois. Relevez le bloc Épargne ou allongez une échéance.`,
        lesson: 1,
        link: '/plan',
      });
      // Besoin couvert (égalité comprise) : rien.
      const covered = withProjects([project()], [], {
        plan: SpacePlan.create({
          incomeCents: 320000,
          fixeCents: 125000,
          courantCents: 100000,
          plaisirCents: 45000,
          epargneCents: 50000,
        }),
      });
      expect(ids(covered)).not.toContain('projects-exceed-savings');
      expect(ids(withProjects([project({ archived: true })]))).not.toContain(
        'projects-exceed-savings',
      );
      expect(ids(withProjects([]))).not.toContain('projects-exceed-savings');
    });

    it('celebrates a project reached in the last 30 days, boundary included', () => {
      const small = project({ targetCents: 100000 });
      const reachedOn = (date: string) =>
        ids(withProjects([small], [deposit(date, 100000)])).includes(
          'project-reached',
        );
      expect(reachedOn('2026-11-19')).toBe(true);
      expect(reachedOn('2026-10-21')).toBe(true); // exactement 30 jours
      expect(reachedOn('2026-10-20')).toBe(false); // 31 jours
      expect(reachedOn('2026-12-05')).toBe(true); // versement daté du futur
      const insight = byId(
        withProjects([small], [deposit('2026-11-05', 100000)]),
        'project-reached',
      );
      expect(insight).toEqual({
        id: 'project-reached',
        severity: 'GOOD',
        title: 'Objectif atteint : Vacances',
        detail: `Vacances : 1${nbsp}000${nbsp}€ épargnés. Bravo !`,
        lesson: 1,
        link: '/projets',
      });
    });

    it('dates the success by the last deposit that reached the target, and forgets it after a withdrawal', () => {
      const small = project({ targetCents: 100000 });
      // Atteint le 1er octobre (trop ancien) puis perdu et retrouvé le 15 novembre : récent.
      const recovered = [
        deposit('2026-10-01', 100000),
        deposit('2026-11-01', -10000),
        deposit('2026-11-15', 10000),
      ];
      expect(ids(withProjects([small], recovered))).toContain(
        'project-reached',
      );
      // Atteint récemment mais repassé sous l'objectif : pas de célébration.
      const lost = [deposit('2026-11-10', 100000), deposit('2026-11-12', -1)];
      expect(ids(withProjects([small], lost))).not.toContain('project-reached');
      // Archivé ou ancien : rien.
      expect(
        ids(
          withProjects(
            [project({ targetCents: 100000, archived: true })],
            [deposit('2026-11-10', 100000)],
          ),
        ),
      ).not.toContain('project-reached');
      expect(
        ids(
          withProjects([small], [deposit('2026-11-10', 100000)], {
            month: '2026-10',
          }),
        ),
      ).not.toContain('project-reached');
    });
  });

  describe('review ritual', () => {
    const EARLY = '2026-11-04T08:00:00Z';
    const done = (decision: string) => ({ status: 'DONE' as const, decision });

    it('links the invitation to the review page', () => {
      const current = byId(
        run({ today: EARLY, transactions: recent }),
        'monthly-review',
      );
      expect(current.link).toBe('/revue');
      expect(current.detail).toContain('décidez une chose');
      const previous = byId(
        run({
          month: '2026-10',
          today: EARLY,
          transactions: [tx('INCOME', null, 'Salaire', 320000, '2026-10-02')],
        }),
        'monthly-review',
      );
      expect(previous.link).toBe('/revue');
    });

    it('keeps the invitation while the previous review is a draft or not started', () => {
      for (const previousReview of [
        null,
        { status: 'TODO' as const, decision: '' },
        { status: 'DRAFT' as const, decision: 'À voir' },
      ]) {
        const insights = run({
          today: EARLY,
          transactions: recent,
          previousReview,
        });
        expect(ids(insights)).toContain('monthly-review');
        expect(ids(insights)).not.toContain('review-done');
      }
    });

    it('replaces the invitation by review-done once the review is DONE, quoting the decision', () => {
      for (const month of ['2026-11', '2026-10']) {
        const insights = run({
          month,
          today: EARLY,
          transactions: [tx('INCOME', null, 'Salaire', 320000, `${month}-02`)],
          previousReview: done('Cuisiner davantage et limiter les restaurants'),
        });
        expect(ids(insights)).not.toContain('monthly-review');
        expect(byId(insights, 'review-done')).toEqual({
          id: 'review-done',
          severity: 'GOOD',
          title: 'Revue de octobre 2026 faite',
          detail:
            'Décision prise : « Cuisiner davantage et limiter les restaurants ». Gardez le cap ce mois-ci.',
          lesson: 4,
          link: '/revue',
        });
      }
    });

    it('only shows review-done during the first seven days and for the current or previous month', () => {
      const at = (today: string, month = '2026-11') =>
        ids(
          run({
            month,
            today,
            transactions: recent,
            previousReview: done('x'),
          }),
        ).includes('review-done');
      expect(at('2026-11-01T00:00:00Z')).toBe(true);
      expect(at('2026-11-07T23:00:00Z')).toBe(true);
      expect(at('2026-11-08T00:00:00Z')).toBe(false);
      expect(at(EARLY, '2026-09')).toBe(false);
      expect(at(EARLY, '2026-12')).toBe(false);
    });

    it('truncates a long decision and handles the year boundary', () => {
      const long = 'a'.repeat(200);
      const insight = byId(
        run({
          month: '2027-01',
          today: '2027-01-03T08:00:00Z',
          transactions: [tx('EXPENSE', 'COURANT', 'x', 100, '2027-01-02')],
          previousReview: done(long),
        }),
        'review-done',
      );
      expect(insight.title).toBe('Revue de décembre 2026 faite');
      expect(insight.detail).toBe(
        `Décision prise : « ${'a'.repeat(119)}… ». Gardez le cap ce mois-ci.`,
      );
    });

    it('counts as a real insight: no all-good next to it', () => {
      const insights = run({
        today: EARLY,
        transactions: recent,
        previousReview: done('x'),
      });
      expect(ids(insights)).toEqual(['review-done']);
    });
  });

  describe('debts', () => {
    const summary = (percent: number | null, monthly = 142000) => ({
      activeCount: 2,
      totalRemainingCents: 21000000,
      totalMonthlyCents: monthly,
      debtToIncomePercent: percent,
    });
    const ctx = (
      over: Partial<DebtsInsightContext> = {},
    ): DebtsInsightContext => ({
      summary: summary(36),
      monthlyIncomeCents: 400000,
      neverPaidOff: [],
      ...over,
    });
    const stuck = (name: string, payment = 30000, interest = 30000) => ({
      name,
      monthlyPaymentCents: payment,
      nextMonthInterestCents: interest,
    });

    it('warns above 35 % of the income, with the cost and the income', () => {
      const insight = byId(
        run({ transactions: recent, debts: ctx() }),
        'debt-ratio-high',
      );
      expect(insight).toEqual({
        id: 'debt-ratio-high',
        severity: 'WARNING',
        title: 'Endettement à 36 % de vos revenus',
        detail: `Vos crédits coûtent 1${nbsp}420${nbsp}€ par mois (assurances comprises) pour 4${nbsp}000${nbsp}€ de revenus : au-dessus du repère de 35 %, la marge de manœuvre est faible. Évitez un nouveau crédit et regardez l'effet d'un remboursement accéléré.`,
        lesson: 5,
        link: '/dettes',
      });
    });

    it('stays silent at 35 % or below, without income, and outside the current month', () => {
      const has = (over: Parameters<typeof run>[0]) =>
        ids(run({ transactions: recent, ...over })).includes('debt-ratio-high');
      expect(has({ debts: ctx({ summary: summary(35) }) })).toBe(false);
      expect(has({ debts: ctx({ summary: summary(36) }) })).toBe(true);
      expect(has({ debts: ctx({ summary: summary(0) }) })).toBe(false);
      expect(
        has({
          debts: ctx({ summary: summary(null), monthlyIncomeCents: null }),
        }),
      ).toBe(false);
      expect(has({ debts: ctx(), month: '2026-10' })).toBe(false);
      expect(has({ debts: ctx(), month: '2026-12' })).toBe(false);
    });

    it('flags a credit that never decreases, then groups several', () => {
      const one = byId(
        run({
          transactions: recent,
          debts: ctx({
            summary: summary(10),
            neverPaidOff: [stuck('Prêt auto', 29900, 30000)],
          }),
        }),
        'debt-never-paid-off',
      );
      expect(one).toEqual({
        id: 'debt-never-paid-off',
        severity: 'ACTION',
        title: 'Le crédit « Prêt auto » ne diminue pas',
        detail: `Sa mensualité de 299${nbsp}€ ne dépasse pas les intérêts du mois (300${nbsp}€) ou ne le rembourserait pas en 100 ans. Vérifiez la mensualité et le taux saisis.`,
        lesson: 5,
        link: '/dettes',
      });
      const many = byId(
        run({
          transactions: recent,
          debts: ctx({
            summary: summary(10),
            neverPaidOff: [stuck('A'), stuck('B'), stuck('C'), stuck('D')],
          }),
        }),
        'debt-never-paid-off',
      );
      expect(many.title).toBe('4 crédits ne diminuent pas');
      expect(many.detail).toContain('A, B, C et 1 autre');
      expect(
        ids(
          run({
            transactions: recent,
            debts: ctx({ summary: summary(10), neverPaidOff: [stuck('A')] }),
            month: '2026-10',
          }),
        ),
      ).not.toContain('debt-never-paid-off');
    });

    it('ranks the ratio warning before the never-paid-off action', () => {
      const insights = run({
        transactions: recent,
        debts: ctx({ neverPaidOff: [stuck('Prêt auto')] }),
      });
      const order = ids(insights);
      expect(order.indexOf('debt-ratio-high')).toBeLessThan(
        order.indexOf('debt-never-paid-off'),
      );
      expect(order).not.toContain('all-good');
    });

    it('gives no investment advice or loan buy-back suggestion', () => {
      const text = JSON.stringify(
        run({
          transactions: recent,
          debts: ctx({ neverPaidOff: [stuck('Prêt auto')] }),
        }),
      ).toLowerCase();
      for (const word of ['investir', 'placement', 'rachat', 'renégoci']) {
        expect(text).not.toContain(word);
      }
    });
  });

  describe('spending riser', () => {
    const riser: Riser = {
      label: 'Restaurant',
      recentAverageCents: 9000,
      previousAverageCents: 4000,
      deltaCents: 5000,
    };

    it('mentions the label with the before and after averages (current month only)', () => {
      const insight = byId(
        run({ transactions: recent, spendingRiser: riser }),
        'spending-riser',
      );
      expect(insight).toEqual({
        id: 'spending-riser',
        severity: 'INFO',
        title: 'Dépense en hausse : Restaurant',
        detail: `Restaurant passe de 40${nbsp}€ à 90${nbsp}€ par mois en moyenne (+50${nbsp}€). Est-ce voulu ? Regardez le détail avant que ça devienne une habitude.`,
        lesson: 4,
        link: '/tendances',
      });
      for (const month of ['2026-10', '2026-12']) {
        expect(
          ids(run({ month, transactions: recent, spendingRiser: riser })),
        ).not.toContain('spending-riser');
      }
    });

    it('is emitted at most once and never without a riser', () => {
      const insights = run({ transactions: recent, spendingRiser: riser });
      expect(
        ids(insights).filter((id) => id === 'spending-riser'),
      ).toHaveLength(1);
      expect(ids(run({ transactions: recent, spendingRiser: null }))).toEqual([
        'all-good',
      ]);
    });
  });

  describe('ordering and limits', () => {
    const crowded: Scenario = {
      today: '2026-11-12T08:00:00Z',
      plan: SpacePlan.create({
        incomeCents: 300000,
        fixeCents: 100000,
        courantCents: 100000,
        plaisirCents: 100000,
        epargneCents: 50000,
      }),
      transactions: [
        tx('INCOME', null, 'Salaire', 100000, '2026-11-01'),
        tx('EXPENSE', 'FIXE', 'Loyer', 120000, '2026-11-01'),
        tx('EXPENSE', 'COURANT', 'Courses', 130000, '2026-11-01'),
        tx('EXPENSE', 'PLAISIR', 'Sorties', 110000, '2026-11-01'),
      ],
      recurring: [
        rec('EXPENSE', 'FIXE', 'Assurance', 4500, { dayOfMonth: 8 }),
        rec('EXPENSE', 'PLAISIR', 'Netflix', 1399, { dayOfMonth: 15 }),
      ],
      common: {
        safetyNet: null,
        contributionIncomplete: true,
        myContribution: null,
      },
    };

    it('keeps at most 8 insights, most important first', () => {
      const insights = run(crowded);
      expect(insights).toHaveLength(MAX_INSIGHTS);
      expect(ids(insights)).toEqual([
        'plan-overcommitted',
        'month-deficit',
        'bloc-overrun-FIXE',
        'bloc-overrun-COURANT',
        'bloc-overrun-PLAISIR',
        'recurring-missing',
        'contribution-incomplete',
        'savings-behind',
      ]);
      const rank = { WARNING: 0, ACTION: 1, INFO: 2, GOOD: 3 };
      const ranks = insights.map((i) => rank[i.severity]);
      expect([...ranks].sort()).toEqual(ranks);
    });

    it('is deterministic', () => {
      expect(run(crowded)).toEqual(run(crowded));
    });

    it('only uses known ids, links and lessons', () => {
      const known = new RegExp(
        '^(plan-missing|plan-overcommitted|plan-unassigned|month-deficit|bloc-overrun-(FIXE|COURANT|PLAISIR)|recurring-missing|upcoming-payments|no-recent-activity|monthly-review|savings-behind|savings-on-track|account-negative-projected|accounts-unassigned|upcoming-big-payment|provision-suggestion|project-behind|projects-exceed-savings|project-reached|review-done|debt-ratio-high|debt-never-paid-off|spending-riser|safety-net-unset|safety-net-progress|contribution-incomplete|contribution-pending|all-good)$',
      );
      const insights = [
        ...run(crowded),
        ...run({ today: '2026-11-03T08:00:00Z', transactions: recent }),
        ...run({ lastActivity: null }),
      ];
      for (const insight of insights) {
        expect(insight.id).toMatch(known);
        expect([
          null,
          '/plan',
          '/import',
          '/foyer',
          '/previsionnel',
          '/aides',
          '/comptes',
          '/projets',
          '/revue',
          '/dettes',
          '/tendances',
          '/',
        ]).toContain(insight.link);
        expect([null, 1, 2, 3, 4, 5, 6, 7, 8]).toContain(insight.lesson);
      }
    });

    it('never gives investment advice', () => {
      const text = JSON.stringify(run(crowded)).toLowerCase();
      for (const word of ['investir', 'placement', 'bourse', 'crypto', 'etf']) {
        expect(text).not.toContain(word);
      }
    });
  });
});
