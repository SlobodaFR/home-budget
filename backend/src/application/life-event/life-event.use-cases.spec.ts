import { NotFoundException } from '@nestjs/common';
import { LIFE_EVENT_CATALOG } from '../../domain/life-event/catalog';
import { DomainError } from '../../domain/shared/domain-error';
import { User } from '../../domain/user/user';
import { FakeClock } from '../../testing/fake-clock';
import {
  InMemoryHouseholdRepository,
  InMemoryLifeEventRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from '../household/create-household.use-case';
import { CreateInvitationUseCase } from '../household/create-invitation.use-case';
import { HouseholdViewBuilder } from '../household/household.dto';
import { JoinHouseholdUseCase } from '../household/join-household.use-case';
import { SpaceAccessService } from '../household/space-access.service';
import { LifeEventViewsService } from './life-event-views.service';
import {
  CreateLifeEventUseCase,
  DeleteLifeEventUseCase,
  GetLifeEventCatalogUseCase,
  ListLifeEventsUseCase,
  SetLifeEventStepUseCase,
  UpdateLifeEventUseCase,
} from './life-event.use-cases';

async function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const id of ['alice', 'bob', 'carol', 'dave']) {
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
  const clock = FakeClock.at('2026-11-12T09:30:00Z');
  const events = new InMemoryLifeEventRepository();
  const views = new LifeEventViewsService(events, clock);

  await new CreateHouseholdUseCase(households, view).execute('alice', {
    name: 'Foyer A',
  });
  const { code } = await new CreateInvitationUseCase(
    households,
    access,
  ).execute('alice');
  await new JoinHouseholdUseCase(households, view).execute('bob', code);
  await new CreateHouseholdUseCase(households, view).execute('carol', {
    name: 'Foyer C',
  });

  return {
    clock,
    events,
    catalog: new GetLifeEventCatalogUseCase(),
    list: new ListLifeEventsUseCase(access, views),
    create: new CreateLifeEventUseCase(access, events, views, clock),
    update: new UpdateLifeEventUseCase(access, events, clock),
    remove: new DeleteLifeEventUseCase(access, events),
    setStep: new SetLifeEventStepUseCase(access, events, clock),
  };
}

describe('life event use cases', () => {
  it('exposes the catalog without any household', async () => {
    const { catalog } = await setup();
    expect(catalog.execute()).toBe(LIFE_EVENT_CATALOG);
  });

  it('creates an event for the household with the catalog label by default', async () => {
    const { create, list } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    expect(created).toMatchObject({
      type: 'BIRTH',
      label: "Naissance d'un enfant",
      eventDate: '2026-11-10',
      doneCount: 0,
      progressPercent: 0,
    });
    expect(created.totalCount).toBe(LIFE_EVENT_CATALOG[0].steps.length);
    // Bob, de la même famille, le voit ; Carol (autre foyer) ne le voit pas.
    expect((await list.execute('bob')).map((e) => e.id)).toEqual([created.id]);
    expect(await list.execute('carol')).toEqual([]);
  });

  it('computes step statuses with the injected clock', async () => {
    const { create, clock } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
      label: '  Bébé 2  ',
    });
    expect(created.label).toBe('Bébé 2');
    const declaration = created.steps.find(
      (s) => s.stepId === 'birth-declaration',
    );
    // 10 nov. + 5 jours = 15 nov. ; aujourd'hui 12 nov. : bientôt due.
    expect(declaration).toMatchObject({
      dueDate: '2026-11-15',
      status: 'DUE_SOON',
    });
    clock.set('2026-11-16T00:00:00Z');
    const later = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    expect(
      later.steps.find((s) => s.stepId === 'birth-declaration')?.status,
    ).toBe('OVERDUE');
  });

  it('validates type, date range (-24 to +18 months) and label', async () => {
    const { create } = await setup();
    await expect(
      create.execute('alice', { type: 'MOVING', eventDate: '2026-11-10' }),
    ).rejects.toThrow(DomainError);
    for (const eventDate of ['2024-11-11', '2028-05-13', '2026-02-30']) {
      await expect(
        create.execute('alice', { type: 'BIRTH', eventDate }),
      ).rejects.toThrow(DomainError);
    }
    for (const eventDate of ['2024-11-12', '2028-05-12']) {
      await expect(
        create.execute('alice', { type: 'BIRTH', eventDate }),
      ).resolves.toMatchObject({ eventDate });
    }
    await expect(
      create.execute('alice', {
        type: 'BIRTH',
        eventDate: '2026-11-10',
        label: 'x'.repeat(61),
      }),
    ).rejects.toThrow(/60/);
    await expect(
      create.execute('alice', {
        type: 'BIRTH',
        eventDate: '2026-11-10',
        label: '   ',
      }),
    ).rejects.toThrow(DomainError);
  });

  it('answers 404 to a user without household on every operation', async () => {
    const { create, list, update, remove, setStep } = await setup();
    await expect(list.execute('dave')).rejects.toThrow(NotFoundException);
    await expect(
      create.execute('dave', { type: 'BIRTH', eventDate: '2026-11-10' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      update.execute('dave', 'x', { eventDate: '2026-11-10', label: 'a' }),
    ).rejects.toThrow(NotFoundException);
    await expect(remove.execute('dave', 'x')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      setStep.execute('dave', 'x', 'birth-declaration', { done: true }),
    ).rejects.toThrow(NotFoundException);
  });

  it('answers 404 for an event of another household, and never changes it', async () => {
    const { create, list, update, remove, setStep } = await setup();
    const mine = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    await expect(
      update.execute('carol', mine.id, {
        eventDate: '2026-12-01',
        label: 'Piraté',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(remove.execute('carol', mine.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      setStep.execute('carol', mine.id, 'birth-declaration', { done: true }),
    ).rejects.toThrow(NotFoundException);
    expect((await list.execute('alice'))[0]).toMatchObject({
      label: "Naissance d'un enfant",
      eventDate: '2026-11-10',
      doneCount: 0,
    });
  });

  it('lets any member tick, annotate and untick a step, keeping the first done instant', async () => {
    const { create, list, setStep, clock } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    const stepOf = async (stepId: string) =>
      (await list.execute('alice'))[0].steps.find((s) => s.stepId === stepId)!;

    await setStep.execute('bob', created.id, 'birth-declaration', {
      done: true,
      note: 'Fait à la mairie du 3e',
    });
    expect(await stepOf('birth-declaration')).toMatchObject({
      status: 'DONE',
      doneAt: '2026-11-12T09:30:00.000Z',
      note: 'Fait à la mairie du 3e',
    });
    const [view] = await list.execute('alice');
    expect([view.doneCount, view.progressPercent]).toEqual([
      1,
      Math.floor(100 / view.totalCount),
    ]);

    clock.set('2026-11-14T10:00:00Z');
    await setStep.execute('alice', created.id, 'birth-declaration', {
      done: true,
    });
    expect((await stepOf('birth-declaration')).doneAt).toBe(
      '2026-11-12T09:30:00.000Z',
    );
    expect((await stepOf('birth-declaration')).note).toBe(
      'Fait à la mairie du 3e',
    );

    await setStep.execute('alice', created.id, 'birth-declaration', {
      done: false,
    });
    expect(await stepOf('birth-declaration')).toMatchObject({
      status: 'DUE_SOON',
      doneAt: null,
    });
  });

  it('refuses a note over 200 characters, and answers 404 for an unknown step', async () => {
    const { create, setStep } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    await expect(
      setStep.execute('alice', created.id, 'birth-declaration', {
        done: true,
        note: 'x'.repeat(201),
      }),
    ).rejects.toThrow(DomainError);
    await expect(
      setStep.execute('alice', created.id, 'does-not-exist', { done: true }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      setStep.execute('alice', 'unknown-event', 'birth-declaration', {
        done: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('changes the date, recomputing deadlines but keeping the steps done', async () => {
    const { create, list, update, setStep } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    await setStep.execute('alice', created.id, 'birth-declaration', {
      done: true,
    });
    await update.execute('bob', created.id, {
      eventDate: '2027-01-20',
      label: 'Petit dernier',
    });
    const [view] = await list.execute('alice');
    expect(view).toMatchObject({
      label: 'Petit dernier',
      eventDate: '2027-01-20',
    });
    expect(
      view.steps.find((s) => s.stepId === 'birth-declaration'),
    ).toMatchObject({ status: 'DONE', dueDate: '2027-01-25' });
    expect(
      view.steps.find((s) => s.stepId === 'birth-tax-declaration')?.dueDate,
    ).toBe('2027-03-21');
  });

  it('checks the range only when the date actually changes', async () => {
    const { create, update, events } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    await expect(
      update.execute('alice', created.id, {
        eventDate: '2030-01-01',
        label: 'Trop loin',
      }),
    ).rejects.toThrow(DomainError);
    // Un événement ancien (hors plage aujourd'hui) peut encore être renommé.
    const old = await events.findById(created.id);
    await events.save(old!.withDetails(old!.label, '2020-01-01'));
    await expect(
      update.execute('alice', created.id, {
        eventDate: '2020-01-01',
        label: 'Renommé',
      }),
    ).resolves.toBeUndefined();
    expect((await events.findById(created.id))?.label).toBe('Renommé');
  });

  it('orders events from the most recent to the oldest and supports several events', async () => {
    const { create, list } = await setup();
    const a = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-03-01',
    });
    const b = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2027-02-01',
    });
    const c = await create.execute('bob', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    expect((await list.execute('alice')).map((e) => e.id)).toEqual([
      b.id,
      c.id,
      a.id,
    ]);
  });

  it('deletes an event of the household', async () => {
    const { create, list, remove } = await setup();
    const created = await create.execute('alice', {
      type: 'BIRTH',
      eventDate: '2026-11-10',
    });
    await remove.execute('bob', created.id);
    expect(await list.execute('alice')).toEqual([]);
    await expect(remove.execute('alice', created.id)).rejects.toThrow(
      NotFoundException,
    );
  });
});
