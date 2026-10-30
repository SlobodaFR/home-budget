import { describe, expect, it } from 'vitest';
import {
  buildCommitItems,
  Choices,
  collectLearnedRules,
  computeTotals,
  dominantMonth,
  findSimilarUnclassified,
  groupRows,
  initialChoice,
  initialChoices,
  keywordsByIndex,
} from './statement-import';
import { previewRow } from '../test/fixtures';

describe('initialChoice', () => {
  it('follows the server suggestion', () => {
    expect(initialChoice(previewRow(0, { target: 'FIXE' }))).toBe('FIXE');
    expect(initialChoice(previewRow(0, { target: 'IGNORE' }))).toBe('IGNORE');
  });

  it('preselects income for an INCOME suggestion or a positive amount', () => {
    expect(initialChoice(previewRow(0, { target: 'INCOME', amountCents: 200000 }))).toBe('INCOME');
    expect(initialChoice(previewRow(0, { amountCents: 5000 }))).toBe('INCOME');
  });

  it('keeps a negative row without suggestion unclassified', () => {
    expect(initialChoice(previewRow(0))).toBeNull();
  });

  it('ignores duplicates whatever the suggestion', () => {
    expect(initialChoice(previewRow(0, { duplicate: true, target: 'FIXE' }))).toBe('IGNORE');
    expect(initialChoice(previewRow(0, { duplicate: true }))).toBe('IGNORE');
  });
});

describe('groupRows', () => {
  it('splits rows into to-classify, classified and duplicates, keeping the order', () => {
    const rows = [
      previewRow(0, { target: 'FIXE' }),
      previewRow(1),
      previewRow(2, { duplicate: true, target: 'FIXE' }),
      previewRow(3, { amountCents: 9000 }),
      previewRow(4),
    ];
    const groups = groupRows(rows);
    expect(groups.toClassify.map((row) => row.index)).toEqual([1, 4]);
    expect(groups.classified.map((row) => row.index)).toEqual([0, 3]);
    expect(groups.duplicates.map((row) => row.index)).toEqual([2]);
  });
});

describe('computeTotals', () => {
  const rows = [
    previewRow(0, { target: 'FIXE', amountCents: -110000 }),
    previewRow(1, { target: 'COURANT', amountCents: -4250 }),
    previewRow(2, { target: 'COURANT', amountCents: -1000 }),
    previewRow(3, { amountCents: 250000 }),
    previewRow(4),
    previewRow(5, { duplicate: true, target: 'PLAISIR', amountCents: -3000 }),
  ];

  it('sums absolute amounts per target and counts rows to classify', () => {
    const totals = computeTotals(rows, initialChoices(rows));
    expect(totals.byBloc).toEqual({ FIXE: 110000, COURANT: 5250, PLAISIR: 0, EPARGNE: 0 });
    expect(totals.incomeCents).toBe(250000);
    expect(totals.toClassifyCount).toBe(1);
    expect(totals.toCreateCount).toBe(4);
  });

  it('updates when a row is classified or ignored', () => {
    const choices: Choices = { ...initialChoices(rows), 4: 'PLAISIR', 0: 'IGNORE' };
    const totals = computeTotals(rows, choices);
    expect(totals.byBloc.PLAISIR).toBe(1000);
    expect(totals.byBloc.FIXE).toBe(0);
    expect(totals.toClassifyCount).toBe(0);
    expect(totals.toCreateCount).toBe(4);
  });
});

describe('buildCommitItems', () => {
  it('builds positive amounts, kinds and blocs, and leaves out ignored and unclassified rows', () => {
    const rows = [
      previewRow(0, { target: 'FIXE', amountCents: -110000, label: 'PRLV LOYER', date: '2026-10-02T00:00:00.000Z' }),
      previewRow(1, { amountCents: 250000, label: 'VIR SALAIRE', date: '2026-10-28T00:00:00.000Z' }),
      previewRow(2, { target: 'IGNORE' }),
      previewRow(3),
      previewRow(4, { duplicate: true }),
    ];
    expect(buildCommitItems(rows, initialChoices(rows))).toEqual([
      { kind: 'EXPENSE', bloc: 'FIXE', label: 'PRLV LOYER', amountCents: 110000, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'INCOME', label: 'VIR SALAIRE', amountCents: 250000, date: '2026-10-28T00:00:00.000Z' },
    ]);
  });

  it('sends no bloc for an income', () => {
    const rows = [previewRow(0, { amountCents: 100 })];
    expect(buildCommitItems(rows, initialChoices(rows))[0]).not.toHaveProperty('bloc');
  });

  it('truncates the label to 80 characters and keeps it otherwise as received', () => {
    const rows = [previewRow(0, { target: 'COURANT', label: `  ${'x'.repeat(100)}` })];
    const [item] = buildCommitItems(rows, initialChoices(rows));
    expect(item.label).toBe(`  ${'x'.repeat(78)}`);
    expect(item.label).toHaveLength(80);
  });

  it('falls back to a default label when the label is blank', () => {
    const rows = [previewRow(0, { target: 'PLAISIR', label: '   ' })];
    expect(buildCommitItems(rows, initialChoices(rows))[0].label).toBe('Plaisir');
  });

  it('uses the user choice over the suggestion', () => {
    const rows = [previewRow(0, { target: 'FIXE' })];
    expect(buildCommitItems(rows, { 0: 'EPARGNE' })[0]).toMatchObject({ kind: 'EXPENSE', bloc: 'EPARGNE' });
  });
});

describe('dominantMonth', () => {
  it('returns the most frequent month', () => {
    const items = ['2026-09-30T00:00:00.000Z', '2026-10-02T00:00:00.000Z', '2026-10-15T00:00:00.000Z'].map((date) => ({ date }));
    expect(dominantMonth(items)).toBe('2026-10');
  });

  it('prefers the latest month on a tie and handles an empty list', () => {
    expect(dominantMonth([{ date: '2026-09-01T00:00:00.000Z' }, { date: '2026-10-01T00:00:00.000Z' }])).toBe('2026-10');
    expect(dominantMonth([])).toBeNull();
  });
});

describe('similar rows and learned rules', () => {
  const rows = [
    previewRow(0, { label: 'CB CARREFOUR MARKET 01/10' }),
    previewRow(1, { label: 'CB CARREFOUR CITY 05/10' }),
    previewRow(2, { label: 'CB CARREFOUR MARKET 09/10', target: 'COURANT' }),
    previewRow(3, { label: 'PRLV NETFLIX' }),
  ];
  const keywords = keywordsByIndex(rows);

  it('finds other unclassified rows sharing the keyword', () => {
    expect(findSimilarUnclassified(keywords, initialChoices(rows), 0)).toEqual([1]);
    expect(findSimilarUnclassified(keywords, initialChoices(rows), 3)).toEqual([]);
  });

  it('collects a learned rule only for manual choices', () => {
    const choices: Choices = { ...initialChoices(rows), 0: 'COURANT', 2: 'COURANT' };
    const learned = collectLearnedRules(rows, choices, { 0: 'carrefour', 2: 'carrefour', 3: 'netflix' });
    expect(learned).toEqual([{ keyword: 'carrefour', target: 'COURANT' }]);
  });

  it('drops the learned rule when the row goes back to its initial choice', () => {
    expect(collectLearnedRules(rows, initialChoices(rows), { 2: 'carrefour' })).toEqual([]);
  });
});
