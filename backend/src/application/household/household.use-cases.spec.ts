import { ConflictException, NotFoundException } from '@nestjs/common';
import { User } from '../../domain/user/user';
import {
  InMemoryHouseholdRepository,
  InMemoryUserRepository,
} from '../../testing/in-memory-repositories';
import { CreateHouseholdUseCase } from './create-household.use-case';
import { CreateInvitationUseCase } from './create-invitation.use-case';
import { GetHouseholdUseCase } from './get-household.use-case';
import { HouseholdViewBuilder } from './household.dto';
import { JoinHouseholdUseCase } from './join-household.use-case';
import { SpaceAccessService } from './space-access.service';

function setup() {
  const households = new InMemoryHouseholdRepository();
  const users = new InMemoryUserRepository();
  for (const [id, name] of [
    ['alice', 'Alice'],
    ['bob', 'Bob'],
    ['carol', 'Carol'],
  ]) {
    void users.save(
      User.create({
        id,
        email: `${id}@example.test`,
        name,
        avatarUrl: '',
        createdAt: new Date(),
      }),
    );
  }
  const view = new HouseholdViewBuilder(users);
  const access = new SpaceAccessService(households);
  return {
    households,
    create: new CreateHouseholdUseCase(households, view),
    get: new GetHouseholdUseCase(households, view),
    invite: new CreateInvitationUseCase(households, access),
    join: new JoinHouseholdUseCase(households, view),
  };
}

describe('household use cases', () => {
  it('creates a household with a common space and a personal space', async () => {
    const { create } = setup();
    const household = await create.execute('alice', {
      name: 'Famille',
      netMonthlyIncomeCents: 350000,
    });

    expect(household.role).toBe('OWNER');
    expect(household.spaces.map((s) => s.kind)).toEqual(['COMMON', 'PERSONAL']);
    expect(household.members).toEqual([
      {
        userId: 'alice',
        name: 'Alice',
        role: 'OWNER',
        netMonthlyIncomeCents: 350000,
      },
    ]);
  });

  it('refuses a second household for the same user', async () => {
    const { create } = setup();
    await create.execute('alice', { name: 'Famille' });
    await expect(
      create.execute('alice', { name: 'Autre' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a partner join with an invitation and never shows her the other personal space', async () => {
    const { create, invite, join, get, households } = setup();
    await create.execute('alice', { name: 'Famille' });
    const { code } = await invite.execute('alice');

    const joined = await join.execute('bob', code);
    expect(joined.members.map((m) => m.userId).sort()).toEqual([
      'alice',
      'bob',
    ]);
    expect(joined.spaces.map((s) => s.kind)).toEqual(['COMMON', 'PERSONAL']);

    const bobPersonal = households.spaces.find((s) => s.ownerUserId === 'bob')!;
    const alicePersonal = households.spaces.find(
      (s) => s.ownerUserId === 'alice',
    )!;
    const bobView = (await get.execute('bob')).household!;
    const aliceView = (await get.execute('alice')).household!;
    expect(bobView.spaces.map((s) => s.id)).toContain(bobPersonal.id);
    expect(bobView.spaces.map((s) => s.id)).not.toContain(alicePersonal.id);
    expect(aliceView.spaces.map((s) => s.id)).not.toContain(bobPersonal.id);
  });

  it('uses an invitation only once', async () => {
    const { create, invite, join } = setup();
    await create.execute('alice', { name: 'Famille' });
    const { code } = await invite.execute('alice');
    await join.execute('bob', code);
    await expect(join.execute('carol', code)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an unknown code and a user who already has a household', async () => {
    const { create, invite, join } = setup();
    await expect(join.execute('bob', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await create.execute('alice', { name: 'A' });
    await create.execute('bob', { name: 'B' });
    const { code } = await invite.execute('alice');
    await expect(join.execute('bob', code)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an expired invitation', async () => {
    const { create, invite, join } = setup();
    await create.execute('alice', { name: 'A' });
    const { code } = await invite.execute('alice');
    jest.useFakeTimers().setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    try {
      await expect(join.execute('bob', code)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses to invite when the user has no household', async () => {
    const { invite } = setup();
    await expect(invite.execute('alice')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
