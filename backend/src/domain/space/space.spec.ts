import { Space, isVisibleTo } from './space';

describe('Space visibility', () => {
  const common = Space.create({
    id: 'c',
    householdId: 'h',
    kind: 'COMMON',
    ownerUserId: null,
    name: 'Commun',
  });
  const alicePersonal = Space.create({
    id: 'p-alice',
    householdId: 'h',
    kind: 'PERSONAL',
    ownerUserId: 'alice',
    name: 'Perso',
  });

  it('shows the common space to anyone asking', () => {
    expect(isVisibleTo(common, 'alice')).toBe(true);
    expect(isVisibleTo(common, 'bob')).toBe(true);
  });

  it('shows a personal space to its owner only', () => {
    expect(isVisibleTo(alicePersonal, 'alice')).toBe(true);
    expect(isVisibleTo(alicePersonal, 'bob')).toBe(false);
  });

  it('rejects inconsistent spaces', () => {
    expect(() =>
      Space.create({
        id: 'x',
        householdId: 'h',
        kind: 'PERSONAL',
        ownerUserId: null,
        name: 'x',
      }),
    ).toThrow();
    expect(() =>
      Space.create({
        id: 'x',
        householdId: 'h',
        kind: 'COMMON',
        ownerUserId: 'a',
        name: 'x',
      }),
    ).toThrow();
  });
});
