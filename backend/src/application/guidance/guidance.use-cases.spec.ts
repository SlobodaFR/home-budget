import { NotFoundException } from '@nestjs/common';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryAccountRepository,
  InMemoryFiscalProfileRepository,
  InMemoryHouseholdRepository,
  InMemoryProjectRepository,
  InMemoryRecurringItemRepository,
  InMemorySafetyNetRepository,
  InMemorySpacePlanRepository,
  InMemoryTransactionRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { AccountAssignmentService } from '../account/account-assignment.service';
import { ProjectViewsService } from '../project/project-views.service';
import { AccountViewsService } from '../account/account-views.service';
import {
  EstimateCrecheUseCase,
  GetAidsUseCase,
  GetFiscalProfileUseCase,
  ListAidRulesUseCase,
  SaveFiscalProfileUseCase,
} from '../aid/aid.use-cases';
import {
  GetProvisionsUseCase,
  GetYearForecastUseCase,
} from '../provision/provision.use-cases';
import { GetForecastUseCase } from '../forecast/get-forecast.use-case';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { SetMyIncomeUseCase } from '../household/update-household-settings.use-case';
import { GetInsightsUseCase } from '../insights/get-insights.use-case';
import {
  CreateRecurringItemUseCase,
  DeleteRecurringItemUseCase,
  ListRecurringItemsUseCase,
  SaveRecurringCommand,
  UpdateRecurringItemUseCase,
} from '../recurring/recurring.use-cases';
import { SafetyNetProgressService } from '../safety-net/safety-net-progress.service';
import {
  GetSafetyNetUseCase,
  SaveSafetyNetUseCase,
} from '../safety-net/safety-net.use-cases';
import {
  CreateSpaceTransactionUseCase,
  SaveTransactionCommand,
} from '../space/space-transaction.use-cases';
import { SaveSpacePlanUseCase } from '../space/space-plan.use-cases';

async function setup(today = '2026-11-12T09:00:00Z') {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const id of ['alice', 'bob', 'mallory']) {
    await users.save(
      User.create({
        id,
        email: `${id}@example.test`,
        name: id,
        avatarUrl: '',
        createdAt: new Date(),
      }),
    );
  }
  const view = new HouseholdViewBuilder(users);
  const access = new SpaceAccessService(households);
  const plans = new InMemorySpacePlanRepository();
  const transactions = new InMemoryTransactionRepository();
  const recurring = new InMemoryRecurringItemRepository();
  const safetyNets = new InMemorySafetyNetRepository();
  const profiles = new InMemoryFiscalProfileRepository();
  const clock = FakeClock.at(today);
  const accountsRepo = new InMemoryAccountRepository();
  const assignment = new AccountAssignmentService(accountsRepo);
  const projectViews = new ProjectViewsService(
    new InMemoryProjectRepository(),
    clock,
  );
  const accountViews = new AccountViewsService(
    accountsRepo,
    transactions,
    recurring,
    clock,
  );
  const progress = new SafetyNetProgressService(plans, transactions, clock);

  const created = await new CreateHouseholdUseCase(households, view).execute(
    'alice',
    { name: 'F', netMonthlyIncomeCents: 300000 },
  );
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);

  return {
    clock,
    households,
    householdId: created.id,
    commonId: created.spaces.find((s) => s.kind === 'COMMON')!.id,
    alicePersonalId: created.spaces.find((s) => s.kind === 'PERSONAL')!.id,
    createTransaction: new CreateSpaceTransactionUseCase(
      access,
      transactions,
      assignment,
    ),
    savePlan: new SaveSpacePlanUseCase(access, plans),
    setIncome: new SetMyIncomeUseCase(households, access),
    list: new ListRecurringItemsUseCase(access, recurring),
    create: new CreateRecurringItemUseCase(access, recurring, assignment),
    update: new UpdateRecurringItemUseCase(access, recurring, assignment),
    remove: new DeleteRecurringItemUseCase(access, recurring),
    forecast: new GetForecastUseCase(
      access,
      plans,
      transactions,
      recurring,
      clock,
    ),
    insights: new GetInsightsUseCase(
      access,
      plans,
      transactions,
      recurring,
      safetyNets,
      progress,
      accountViews,
      projectViews,
      clock,
    ),
    getSafetyNet: new GetSafetyNetUseCase(access, safetyNets, progress),
    saveSafetyNet: new SaveSafetyNetUseCase(access, safetyNets),
    getProfile: new GetFiscalProfileUseCase(access, profiles),
    saveProfile: new SaveFiscalProfileUseCase(access, profiles),
    aids: new GetAidsUseCase(access, recurring, transactions, profiles, clock),
    catalogue: new ListAidRulesUseCase(),
    provisions: new GetProvisionsUseCase(access, recurring, clock),
    yearForecast: new GetYearForecastUseCase(access, plans, recurring, clock),
    creche: new EstimateCrecheUseCase(),
  };
}

const rent: SaveRecurringCommand = {
  kind: 'EXPENSE',
  bloc: 'FIXE',
  label: 'Loyer',
  amountCents: 110000,
  dayOfMonth: 5,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
};

const cleaning: SaveRecurringCommand = {
  kind: 'EXPENSE',
  bloc: 'COURANT',
  label: 'Femme de ménage',
  amountCents: 10000,
  dayOfMonth: 10,
  startDate: '2026-01-01',
  endDate: null,
  active: true,
  aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
};

const expense = (
  label: string,
  amountCents: number,
  date: string,
  bloc: SaveTransactionCommand['bloc'] = 'FIXE',
): SaveTransactionCommand => ({
  kind: 'EXPENSE',
  bloc,
  label,
  amountCents,
  date: new Date(date),
});

describe('recurring items use cases', () => {
  it('creates, lists (sorted by day), updates and deletes', async () => {
    const s = await setup();
    const late = await s.create.execute('alice', s.commonId, {
      ...rent,
      label: 'Assurance',
      dayOfMonth: 20,
    });
    const first = await s.create.execute('bob', s.commonId, rent);
    const unknown = await s.create.execute('alice', s.commonId, {
      ...rent,
      label: 'Eau',
      dayOfMonth: null,
    });
    expect(first).toMatchObject({
      spaceId: s.commonId,
      kind: 'EXPENSE',
      bloc: 'FIXE',
      label: 'Loyer',
      amountCents: 110000,
      dayOfMonth: 5,
      startDate: '2026-01-01',
      endDate: null,
      active: true,
      aidRuleId: null,
    });
    expect(
      (await s.list.execute('bob', s.commonId)).map((i) => i.label),
    ).toEqual(['Loyer', 'Assurance', 'Eau']);

    await s.update.execute('bob', s.commonId, late.id, {
      ...rent,
      label: 'Assurance auto',
      amountCents: 5000,
      active: false,
    });
    const updated = (await s.list.execute('alice', s.commonId)).find(
      (i) => i.id === late.id,
    )!;
    expect(updated).toMatchObject({
      label: 'Assurance auto',
      amountCents: 5000,
      active: false,
    });

    await s.remove.execute('alice', s.commonId, unknown.id);
    expect(await s.list.execute('alice', s.commonId)).toHaveLength(2);
  });

  it('answers 404 for an unknown item or an item of another space', async () => {
    const s = await setup();
    const other = await s.create.execute('alice', s.alicePersonalId, rent);
    await expect(
      s.update.execute('alice', s.commonId, other.id, rent),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.remove.execute('alice', s.commonId, other.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.remove.execute('alice', s.commonId, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses invalid commands with a domain error', async () => {
    const s = await setup();
    const attempts: SaveRecurringCommand[] = [
      { ...rent, amountCents: 0 },
      { ...rent, bloc: null },
      { ...rent, kind: 'INCOME', bloc: 'FIXE' },
      { ...rent, dayOfMonth: 32 },
      { ...rent, startDate: '2026-02-30' },
      { ...rent, endDate: '2025-12-31' },
      { ...rent, aidRuleId: 'INCONNUE' },
      { ...rent, kind: 'INCOME', bloc: null, aidRuleId: cleaning.aidRuleId },
    ];
    for (const attempt of attempts) {
      await expect(
        s.create.execute('alice', s.commonId, attempt),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('refuses an aid on a personal space', async () => {
    const s = await setup();
    await expect(
      s.create.execute('alice', s.alicePersonalId, cleaning),
    ).rejects.toThrow(/espace commun/);
    await expect(
      s.create.execute('alice', s.commonId, cleaning),
    ).resolves.toMatchObject({
      aidRuleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
    });
  });

  it('hides the personal space of another member on every new use case', async () => {
    const s = await setup();
    const mine = await s.create.execute('alice', s.alicePersonalId, rent);
    const id = s.alicePersonalId;
    const attempts: Promise<unknown>[] = [
      s.list.execute('bob', id),
      s.create.execute('bob', id, rent),
      s.update.execute('bob', id, mine.id, rent),
      s.remove.execute('bob', id, mine.id),
      s.forecast.execute('bob', id, '2026-11'),
      s.insights.execute('bob', id, '2026-11'),
      s.aids.execute('bob', id, 2026),
      s.list.execute('mallory', s.commonId),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(await s.list.execute('alice', id)).toHaveLength(1);
  });
});

describe('forecast use case', () => {
  it('uses the clock, the plan, the operations and the recurring items', async () => {
    const s = await setup();
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 0,
      fixeCents: 150000,
      courantCents: 0,
      plaisirCents: 0,
      epargneCents: 0,
    });
    await s.create.execute('alice', s.commonId, rent);
    await s.create.execute('alice', s.commonId, {
      ...rent,
      label: 'Assurance',
      amountCents: 4500,
      dayOfMonth: 20,
    });
    await s.createTransaction.execute(
      'alice',
      s.commonId,
      expense('PRLV LOYER', 110000, '2026-11-05T00:00:00Z'),
    );

    const forecast = await s.forecast.execute('bob', s.commonId, '2026-11');
    expect(forecast.asOf).toBe('2026-11-12T00:00:00.000Z');
    expect(forecast.occurrences).toEqual([
      expect.objectContaining({
        label: 'Loyer',
        status: 'PAID',
        date: '2026-11-05T00:00:00.000Z',
        estimated: false,
      }),
      expect.objectContaining({ label: 'Assurance', status: 'DUE' }),
    ]);
    expect(forecast.blocs[0]).toEqual({
      bloc: 'FIXE',
      plannedCents: 150000,
      actualCents: 110000,
      expectedRemainingCents: 4500,
      projectedCents: 114500,
    });
    // Commun sans revenu au plan : les contributions couvrent le plan (150 000).
    expect(forecast.income).toMatchObject({
      plannedCents: 150000,
      projectedCents: 150000,
      contributionAssumed: true,
    });
    expect(forecast.projectedBalanceCents).toBe(150000 - 114500);
    expect(forecast.cautiousBalanceCents).toBe(0);

    // La même requête un mois plus tard : l'assurance n'a jamais été retrouvée.
    s.clock.set('2026-12-02T09:00:00Z');
    const later = await s.forecast.execute('bob', s.commonId, '2026-11');
    expect(later.occurrences[1].status).toBe('MISSING');
    expect(later.projectedBalanceCents).toBe(150000 - 110000);
    expect(later.cautiousBalanceCents).toBe(150000 - 110000);
  });
});

describe('safety net and insights use cases', () => {
  it('shares the safety net between members and validates it', async () => {
    const s = await setup();
    expect(await s.getSafetyNet.execute('bob')).toEqual({
      safetyNet: null,
      progress: null,
    });
    await s.saveSafetyNet.execute('alice', {
      savedCents: 550000,
      asOf: '2026-11-01',
      targetMonths: 6,
    });
    // Aucun plan ni historique : pas de base de référence.
    expect(await s.getSafetyNet.execute('bob')).toEqual({
      safetyNet: { savedCents: 550000, asOf: '2026-11-01', targetMonths: 6 },
      progress: {
        currentCents: 550000,
        monthlyBasisCents: 0,
        coveredMonths: null,
      },
    });
    await expect(
      s.saveSafetyNet.execute('bob', {
        savedCents: -1,
        asOf: '2026-11-01',
        targetMonths: 6,
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(s.getSafetyNet.execute('stranger')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('adds the EPARGNE operations posterior to asOf to the coverage', async () => {
    const s = await setup('2026-11-20T09:00:00Z');
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 0,
      epargneCents: 0,
    });
    await s.saveSafetyNet.execute('alice', {
      savedCents: 550000,
      asOf: '2026-11-01',
      targetMonths: 6,
    });
    await s.createTransaction.execute(
      'alice',
      s.commonId,
      expense('Virement livret', 137500, '2026-11-15T00:00:00Z', 'EPARGNE'),
    );
    // Avant asOf : ne compte pas.
    await s.createTransaction.execute(
      'alice',
      s.commonId,
      expense('Ancien virement', 999900, '2026-10-30T00:00:00Z', 'EPARGNE'),
    );

    const { insights } = await s.insights.execute('bob', s.commonId, '2026-11');
    const progress = insights.find((i) => i.id === 'safety-net-progress')!;
    // (550 000 + 137 500) / 275 000 = 2,5 mois
    expect(progress.title).toBe('Épargne de sécurité : 2,5 mois sur 6');

    // L'endpoint donne le brut déclaré et la MÊME progression que le conseil.
    const response = await s.getSafetyNet.execute('alice');
    expect(response.safetyNet!.savedCents).toBe(550000);
    expect(response.progress).toEqual({
      currentCents: 687500,
      monthlyBasisCents: 275000,
      coveredMonths: 2.5,
    });
    expect(progress.detail).toContain(`(2${'\u00a0'}750${'\u00a0'}€ par mois)`);
  });

  it('falls back to the 3-month real average of essential spending when the plan is empty', async () => {
    const s = await setup('2026-11-20T09:00:00Z');
    await s.saveSafetyNet.execute('alice', {
      savedCents: 600000,
      asOf: '2026-11-01',
      targetMonths: 6,
    });
    const at = (label: string, cents: number, date: string, bloc = 'FIXE') =>
      s.createTransaction.execute(
        'alice',
        s.commonId,
        expense(label, cents, date, bloc as 'FIXE'),
      );
    await at('Loyer', 400000, '2026-10-05T00:00:00Z');
    await at('Courses', 200000, '2026-09-05T00:00:00Z', 'COURANT');
    await at('Loyer', 300000, '2026-08-05T00:00:00Z');
    await at('Sorties', 777777, '2026-10-05T00:00:00Z', 'PLAISIR'); // hors essentiel
    await at('Trop ancien', 5000000, '2026-07-31T00:00:00Z'); // avant les 3 mois
    await at('Mois en cours', 5000000, '2026-11-03T00:00:00Z'); // mois en cours exclu
    // (400 000 + 200 000 + 300 000) / 3 = 300 000 ; 600 000 / 300 000 = 2 mois.
    expect((await s.getSafetyNet.execute('bob')).progress).toEqual({
      currentCents: 600000,
      monthlyBasisCents: 300000,
      coveredMonths: 2,
    });
    const { insights } = await s.insights.execute('bob', s.commonId, '2026-11');
    expect(insights.find((i) => i.id === 'safety-net-progress')!.title).toBe(
      'Épargne de sécurité : 2 mois sur 6',
    );
  });

  it('keeps common-only insights out of personal spaces', async () => {
    const s = await setup();
    const common = await s.insights.execute('alice', s.commonId, '2026-11');
    const personal = await s.insights.execute(
      'alice',
      s.alicePersonalId,
      '2026-11',
    );
    expect(common.insights.map((i) => i.id)).toEqual(
      expect.arrayContaining(['safety-net-unset', 'contribution-incomplete']),
    );
    expect(personal.insights.map((i) => i.id)).not.toEqual(
      expect.arrayContaining(['safety-net-unset']),
    );
    expect(
      personal.insights.filter(
        (i) =>
          i.id.startsWith('safety-net') || i.id === 'contribution-incomplete',
      ),
    ).toEqual([]);

    // Une fois le revenu de Bob renseigné, la contribution n'est plus incomplète.
    await s.setIncome.execute('bob', 200000);
    const completed = await s.insights.execute('alice', s.commonId, '2026-11');
    expect(completed.insights.map((i) => i.id)).not.toContain(
      'contribution-incomplete',
    );
  });
});

describe('aids use cases', () => {
  async function withCleaning() {
    const s = await setup('2026-11-12T09:00:00Z');
    await s.create.execute('alice', s.commonId, cleaning);
    return s;
  }

  it('falls back to the template amount and reports a missing profile', async () => {
    const s = await withCleaning();
    const aids = await s.aids.execute('alice', s.commonId, 2026);
    expect(aids.profileMissing).toBe(true);
    expect(aids.rules).toHaveLength(1);
    // 12 occurrences de 100 € ; sans profil : 0 enfant, plafond de 12 000 €.
    expect(aids.rules[0]).toMatchObject({
      ruleId: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
      spentCents: 120000,
      capCents: 1_200_000,
      eligibleCents: 120000,
      expectedCreditCents: 60000,
      capReached: false,
    });
    expect(aids.rules[0].lines[0]).toMatchObject({
      label: 'Femme de ménage',
      yearlySpentCents: 120000,
      monthlyCents: 10000,
      netMonthlyCents: 5000,
    });
    expect(aids.totalExpectedCreditCents).toBe(60000);
  });

  it('uses the real amount of an occurrence found in the operations', async () => {
    const s = await withCleaning();
    await s.createTransaction.execute(
      'alice',
      s.commonId,
      expense('FEMME DE MENAGE CESU', 12000, '2026-03-10T00:00:00Z', 'COURANT'),
    );
    const aids = await s.aids.execute('alice', s.commonId, 2026);
    expect(aids.rules[0].spentCents).toBe(120000 - 10000 + 12000);
  });

  it('counts only the active occurrences within the dates of the year', async () => {
    const s = await setup();
    await s.create.execute('alice', s.commonId, {
      ...cleaning,
      startDate: '2026-04-01',
      endDate: '2026-09-30',
    });
    await s.create.execute('alice', s.commonId, {
      ...cleaning,
      label: 'Jardinier',
      active: false,
    });
    const aids = await s.aids.execute('alice', s.commonId, 2026);
    // Avril à septembre : 6 occurrences ; la ligne inactive n'apparaît pas.
    expect(aids.rules[0].spentCents).toBe(60000);
    expect(aids.rules[0].lines.map((l) => l.label)).toEqual([
      'Femme de ménage',
    ]);
    const nextYear = await s.aids.execute('alice', s.commonId, 2027);
    expect(nextYear.rules).toEqual([]);
    expect(nextYear.totalExpectedCreditCents).toBe(0);
  });

  it('defaults to the current year from the clock', async () => {
    const s = await withCleaning();
    expect((await s.aids.execute('alice', s.commonId)).year).toBe(2026);
    s.clock.set('2027-01-15T09:00:00Z');
    expect((await s.aids.execute('alice', s.commonId)).year).toBe(2027);
  });

  it('applies the shared profile and caps childcare per child', async () => {
    const s = await setup();
    await s.create.execute('alice', s.commonId, {
      ...cleaning,
      label: 'Crèche',
      amountCents: 40000,
      aidRuleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
    });
    expect(await s.getProfile.execute('bob')).toEqual({ fiscalProfile: null });
    await s.saveProfile.execute('bob', {
      childrenUnderSix: 1,
      dependentChildren: 3,
      firstYearHomeServices: false,
    });
    expect(await s.getProfile.execute('alice')).toEqual({
      fiscalProfile: {
        childrenUnderSix: 1,
        dependentChildren: 3,
        firstYearHomeServices: false,
      },
    });
    const aids = await s.aids.execute('alice', s.commonId, 2026);
    expect(aids.profileMissing).toBe(false);
    expect(aids.rules[0]).toMatchObject({
      ruleId: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      spentCents: 480000,
      capCents: 350000,
      expectedCreditCents: 175000,
      capReached: true,
    });
    expect(aids.rules[0].lines[0].netMonthlyCents).toBe(25417);
  });

  it('is reserved to the common space', async () => {
    const s = await setup();
    await expect(
      s.aids.execute('alice', s.alicePersonalId, 2026),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an invalid fiscal profile', async () => {
    const s = await setup();
    await expect(
      s.saveProfile.execute('alice', {
        childrenUnderSix: 11,
        dependentChildren: 0,
        firstYearHomeServices: false,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('exposes the catalogue and the creche estimator', async () => {
    const s = await setup();
    expect(s.catalogue.execute().map((r) => r.id)).toEqual([
      'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
      'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
    ]);
    expect(
      s.creche.execute({
        annualResourcesCents: 7_488_000,
        children: 4,
        hoursPerMonth: 160,
        kind: 'COLLECTIVE',
      }).hourlyRateCents,
    ).toBe(193);
  });
});

describe('non-monthly payments use cases', () => {
  const taxe: SaveRecurringCommand = {
    kind: 'EXPENSE',
    bloc: 'FIXE',
    label: 'Taxe foncière',
    amountCents: 120000,
    dayOfMonth: 15,
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    frequency: 'YEARLY',
    monthOfYear: 10,
  };

  it('stores and exposes frequency and monthOfYear, MONTHLY by default', async () => {
    const s = await setup();
    const yearly = await s.create.execute('alice', s.commonId, taxe);
    expect(yearly).toMatchObject({ frequency: 'YEARLY', monthOfYear: 10 });
    const monthly = await s.create.execute('alice', s.commonId, {
      ...rent,
      label: 'Loyer',
      frequency: undefined,
      monthOfYear: undefined,
    });
    expect(monthly).toMatchObject({ frequency: 'MONTHLY', monthOfYear: null });
    await s.update.execute('alice', s.commonId, monthly.id, {
      ...rent,
      frequency: 'QUARTERLY',
      monthOfYear: 11,
    });
    expect(
      (await s.list.execute('alice', s.commonId)).find(
        (i) => i.id === monthly.id,
      ),
    ).toMatchObject({ frequency: 'QUARTERLY', monthOfYear: 11 });
  });

  it('refuses inconsistent periodicity with a domain error', async () => {
    const s = await setup();
    for (const bad of [
      { frequency: 'YEARLY' as const, monthOfYear: null },
      { frequency: 'QUARTERLY' as const, monthOfYear: undefined },
      { frequency: 'YEARLY' as const, monthOfYear: 13 },
      { frequency: 'MONTHLY' as const, monthOfYear: 3 },
      { frequency: 'WEEKLY' as never, monthOfYear: null },
    ]) {
      await expect(
        s.create.execute('alice', s.commonId, { ...taxe, ...bad }),
      ).rejects.toBeInstanceOf(DomainError);
    }
  });

  it('lists provisions as of a date (default: the clock) and totals them', async () => {
    const s = await setup('2026-10-30T09:00:00Z');
    await s.create.execute('alice', s.commonId, taxe);
    await s.create.execute('alice', s.commonId, rent);
    const byClock = await s.provisions.execute('bob', s.commonId);
    expect(byClock).toEqual({
      asOf: '2026-10-30',
      items: [
        {
          recurringId: expect.any(String),
          label: 'Taxe foncière',
          bloc: 'FIXE',
          frequency: 'YEARLY',
          amountCents: 120000,
          nextDueDate: '2027-10-15',
          monthsUntilDue: 11,
          monthlyProvisionCents: 10000,
          provisionedSoFarCents: null,
        },
      ],
      totalMonthlyProvisionCents: 10000,
      totalNextTwelveMonthsCents: 120000,
    });
    const explicit = await s.provisions.execute(
      'bob',
      s.commonId,
      '2026-10-01',
    );
    expect(explicit.asOf).toBe('2026-10-01');
    expect(explicit.items[0]).toMatchObject({
      nextDueDate: '2026-10-15',
      monthsUntilDue: 0,
    });
    await expect(
      s.provisions.execute('bob', s.commonId, '2026-02-30'),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('builds the year forecast, completing the common income and defaulting to the clock year', async () => {
    const s = await setup('2026-10-30T09:00:00Z');
    await s.savePlan.execute('alice', s.commonId, {
      incomeCents: 0,
      fixeCents: 175000,
      courantCents: 100000,
      plaisirCents: 45000,
      epargneCents: 20000,
    });
    await s.create.execute('alice', s.commonId, taxe);
    const year = await s.yearForecast.execute('bob', s.commonId);
    expect(year.year).toBe(2026);
    expect(year.months).toHaveLength(12);
    expect(year.months[0].incomeCents).toBe(340000);
    expect(year.months[9].items.map((i) => i.label)).toEqual(['Taxe foncière']);
    expect(year.months[9].peak).toBe(true);
    expect(year.provisionHintCents).toBe(10000);
    expect((await s.yearForecast.execute('bob', s.commonId, 2027)).year).toBe(
      2027,
    );
  });

  it('hides the provisions and the year forecast of a personal space from the other member', async () => {
    const s = await setup();
    await s.create.execute('alice', s.alicePersonalId, taxe);
    await expect(
      s.provisions.execute('bob', s.alicePersonalId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      s.yearForecast.execute('bob', s.alicePersonalId, 2026),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await s.provisions.execute('alice', s.alicePersonalId)).items,
    ).toHaveLength(1);
  });

  describe('aids with non-monthly payments', () => {
    const aided = (
      over: Partial<SaveRecurringCommand>,
    ): SaveRecurringCommand => ({
      ...cleaning,
      ...over,
    });

    it('counts a yearly occurrence once in the year and smooths it per month', async () => {
      const s = await setup();
      await s.create.execute(
        'alice',
        s.commonId,
        aided({
          amountCents: 120000,
          frequency: 'YEARLY',
          monthOfYear: 3,
          dayOfMonth: 10,
        }),
      );
      const aids = await s.aids.execute('alice', s.commonId, 2026);
      expect(aids.rules[0]).toMatchObject({
        spentCents: 120000,
        expectedCreditCents: 60000,
      });
      // Lissé : 120 000 / 12 = 10 000 par mois, dont la moitié revient.
      expect(aids.rules[0].lines[0]).toMatchObject({
        yearlySpentCents: 120000,
        monthlyCents: 10000,
        netMonthlyCents: 5000,
      });
    });

    it('counts four occurrences for a quarterly payment', async () => {
      const s = await setup();
      await s.create.execute(
        'alice',
        s.commonId,
        aided({
          amountCents: 30000,
          frequency: 'QUARTERLY',
          monthOfYear: 2,
          dayOfMonth: 10,
        }),
      );
      const aids = await s.aids.execute('alice', s.commonId, 2026);
      expect(aids.rules[0].spentCents).toBe(120000);
      expect(aids.rules[0].lines[0].monthlyCents).toBe(10000);
    });

    it('uses the real amount of the found occurrence and skips a yearly date before startDate', async () => {
      const s = await setup();
      await s.create.execute(
        'alice',
        s.commonId,
        aided({
          amountCents: 120000,
          frequency: 'YEARLY',
          monthOfYear: 3,
          dayOfMonth: 10,
        }),
      );
      await s.createTransaction.execute(
        'alice',
        s.commonId,
        expense(
          'FEMME DE MENAGE ANNUEL',
          130000,
          '2026-03-12T00:00:00Z',
          'COURANT',
        ),
      );
      expect(
        (await s.aids.execute('alice', s.commonId, 2026)).rules[0].spentCents,
      ).toBe(130000);

      const late = await setup();
      await late.create.execute(
        'alice',
        late.commonId,
        aided({
          frequency: 'YEARLY',
          monthOfYear: 3,
          dayOfMonth: 10,
          startDate: '2026-06-01',
        }),
      );
      // 10 mars 2026 est avant startDate : rien en 2026, une occurrence en 2027.
      expect(
        (await late.aids.execute('alice', late.commonId, 2026)).rules,
      ).toEqual([]);
      expect(
        (await late.aids.execute('alice', late.commonId, 2027)).rules[0]
          .spentCents,
      ).toBe(10000);
    });
  });
});
