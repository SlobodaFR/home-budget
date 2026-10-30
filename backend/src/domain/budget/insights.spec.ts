import { rec, tx } from '../../testing/builders';
import { SpacePlan } from '../space/space-plan';
import { Transaction } from '../transaction/transaction';
import { RecurringItem } from '../recurring/recurring-item';
import { buildSafetyNetProgress } from '../safety-net/safety-net-coverage';
import { buildForecast } from './forecast';
import {
  AccountsInsightContext,
  CommonInsightsContext,
  Insight,
  MAX_INSIGHTS,
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

interface Scenario {
  month?: string;
  today?: string;
  plan?: SpacePlan;
  transactions?: Transaction[];
  recurring?: RecurringItem[];
  lastActivity?: Date | null;
  common?: CommonInsightsContext | null;
  accounts?: AccountsInsightContext;
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
        '^(plan-missing|plan-overcommitted|plan-unassigned|month-deficit|bloc-overrun-(FIXE|COURANT|PLAISIR)|recurring-missing|upcoming-payments|no-recent-activity|monthly-review|savings-behind|savings-on-track|account-negative-projected|accounts-unassigned|safety-net-unset|safety-net-progress|contribution-incomplete|all-good)$',
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
