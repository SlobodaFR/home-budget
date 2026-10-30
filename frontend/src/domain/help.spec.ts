import { describe, expect, it } from 'vitest';
import { AidRule } from './aids';
import {
  aidRuleToHelpEntry,
  catalogToHelpEntries,
  countEntries,
  entryMatches,
  filterSections,
  groupEntries,
  helpAnchor,
  HelpEntry,
  HelpSection,
  isSearching,
  normalizeForSearch,
  searchTokens,
  withLiveSources,
} from './help';
import { LifeEventDefinition } from './life-event';

const entry = (overrides: Partial<HelpEntry> & Pick<HelpEntry, 'id' | 'title'>): HelpEntry => ({ blocks: [{ type: 'paragraph', text: 'Texte.' }], ...overrides });

const sections: HelpSection[] = [
  {
    id: 'guide',
    kind: 'guide',
    title: 'Épargne et projets',
    summary: 'Mettre de côté pour plus tard.',
    entries: [
      entry({ id: 'securite', title: 'L’épargne de sécurité', blocks: [{ type: 'paragraph', text: 'Une réserve pour les coups durs.' }] }),
      entry({ id: 'provisions', title: 'Provisions', blocks: [{ type: 'list', items: ['Taxe foncière', 'Assurance annuelle'] }], keywords: ['lisser'] }),
    ],
  },
  {
    id: 'donnees',
    kind: 'guide',
    title: 'Mes données',
    summary: 'Confidentialité.',
    entries: [
      entry({ id: 'chiffrement', title: 'Le chiffrement', blocks: [{ type: 'note', text: 'La clé est détenue par l’hébergeur.' }] }),
      entry({ id: 'export', title: 'Exporter', links: [{ kind: 'external', label: 'Documentation', href: 'https://example.test/' }] }),
    ],
  },
];

describe('normalizeForSearch', () => {
  it('ignores case, accents and typographic apostrophes', () => {
    expect(normalizeForSearch('  Épargne  de SÉCURITÉ ')).toBe('epargne de securite');
    expect(normalizeForSearch('L’hébergeur')).toBe("l'hebergeur");
    expect(normalizeForSearch('Cœur')).toBe('coeur');
  });

  it('treats non-breaking spaces as spaces', () => {
    expect(normalizeForSearch('crèche collective')).toBe('creche collective');
  });
});

describe('searchTokens', () => {
  it('splits into accent-free words', () => {
    expect(searchTokens('Crèche  collective')).toEqual(['creche', 'collective']);
  });

  it('drops a final plural mark on longer words so « crèches » finds « crèche »', () => {
    expect(searchTokens('crèches')).toEqual(['creche']);
    expect(searchTokens('tarifs')).toEqual(['tarif']);
    expect(searchTokens('les')).toEqual(['les']);
    expect(searchTokens('35')).toEqual(['35']);
  });

  it('is empty for a blank query', () => {
    expect(searchTokens('   ')).toEqual([]);
    expect(isSearching('  ')).toBe(false);
    expect(isSearching('a')).toBe(true);
  });
});

describe('filterSections', () => {
  it('returns everything without a query', () => {
    expect(filterSections(sections, '')).toEqual(sections);
    expect(filterSections(sections, '   ')).toEqual(sections);
  });

  it('keeps a whole section when its title matches', () => {
    const result = filterSections(sections, 'epargne');
    expect(result.map((section) => section.id)).toEqual(['guide']);
    expect(result[0]?.entries).toHaveLength(2);
  });

  it('keeps only the matching entries otherwise, and drops sections without any', () => {
    const result = filterSections(sections, 'HEBERGEUR');
    expect(result.map((section) => section.id)).toEqual(['donnees']);
    expect(result[0]?.entries.map((item) => item.id)).toEqual(['chiffrement']);
  });

  it('searches list items, link labels, keywords and sources', () => {
    expect(filterSections(sections, 'taxe fonciere')[0]?.entries.map((item) => item.id)).toEqual(['provisions']);
    expect(filterSections(sections, 'documentation')[0]?.entries.map((item) => item.id)).toEqual(['export']);
    expect(filterSections(sections, 'lisser')[0]?.entries.map((item) => item.id)).toEqual(['provisions']);
    const withSource: HelpSection[] = [{ ...sections[0]!, entries: [entry({ id: 's', title: 'Règle', source: { label: 'impots.gouv.fr', url: null, verifiedOn: null } })] }];
    expect(filterSections(withSource, 'impots').map((section) => section.id)).toEqual(['guide']);
  });

  it('requires every word, wherever they are in the entry or its section title', () => {
    expect(filterSections(sections, 'cle hebergeur')[0]?.entries.map((item) => item.id)).toEqual(['chiffrement']);
    expect(filterSections(sections, 'cle introuvable')).toEqual([]);
    expect(filterSections(sections, 'donnees exporter')[0]?.entries.map((item) => item.id)).toEqual(['export']);
  });

  it('returns nothing when no word matches', () => {
    expect(filterSections(sections, 'zzzz')).toEqual([]);
  });

  it('does not change the original sections', () => {
    filterSections(sections, 'hebergeur');
    expect(sections[1]?.entries).toHaveLength(2);
  });
});

describe('entryMatches / countEntries', () => {
  it('uses the section title as context', () => {
    expect(entryMatches(sections[1]!, sections[1]!.entries[1]!, 'mes donnees')).toBe(true);
    expect(entryMatches(sections[0]!, sections[0]!.entries[1]!, 'mes donnees')).toBe(false);
  });

  it('counts entries across sections', () => {
    expect(countEntries(sections)).toBe(4);
    expect(countEntries([])).toBe(0);
  });
});

describe('groupEntries', () => {
  it('groups by first appearance and keeps ungrouped entries together', () => {
    const groups = groupEntries([
      entry({ id: 'a', title: 'A', group: 'Un' }),
      entry({ id: 'b', title: 'B' }),
      entry({ id: 'c', title: 'C', group: 'Deux' }),
      entry({ id: 'd', title: 'D', group: 'Un' }),
    ]);
    expect(groups.map((group) => [group.title, group.entries.map((item) => item.id)])).toEqual([
      ['Un', ['a', 'd']],
      [null, ['b']],
      ['Deux', ['c']],
    ]);
  });
});

describe('server rules as help entries', () => {
  const rule: AidRule = {
    id: 'CREDIT',
    label: 'Garde d’enfants',
    description: 'Crèche, assistante maternelle…',
    ratePercent: 50,
    capDescription: '3 500 € par enfant',
    cashTiming: 'Versé l’été suivant.',
    sourceLabel: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/x',
    verifiedOn: '2026-10-30',
  };
  const catalog: LifeEventDefinition[] = [
    {
      type: 'BIRTH',
      label: 'Naissance d’un enfant',
      description: '',
      steps: [
        {
          id: 'declaration',
          title: 'Déclarer la naissance',
          detail: 'À la mairie.',
          category: 'ADMIN',
          dueOffsetDays: 5,
          dueLabel: 'Dans les 5 jours',
          sourceLabel: 'service-public.gouv.fr',
          sourceUrl: 'https://www.service-public.gouv.fr/F1',
          verifiedOn: '2026-10-30',
          link: null,
        },
        {
          id: 'conge',
          title: 'Poser un congé',
          detail: 'Selon votre situation.',
          category: 'TRAVAIL',
          dueOffsetDays: null,
          dueLabel: null,
          sourceLabel: 'travail-emploi.gouv.fr',
          sourceUrl: 'https://travail-emploi.gouv.fr/x',
          verifiedOn: null,
          link: null,
        },
      ],
    },
  ];

  it('turns an aid rule into an entry with its rate, cap, timing and source', () => {
    const result = aidRuleToHelpEntry(rule);
    expect(result.title).toBe('Garde d’enfants');
    expect(result.source).toEqual({ label: 'impots.gouv.fr', url: 'https://www.impots.gouv.fr/x', verifiedOn: '2026-10-30' });
    const text = JSON.stringify(result.blocks);
    expect(text).toContain('Taux : 50 %');
    expect(text).toContain('Plafond : 3 500 € par enfant.');
    expect(text).toContain('Versé l’été suivant.');
  });

  it('turns every catalog step into an entry, grouped under its event, with its source', () => {
    const result = catalogToHelpEntries(catalog);
    expect(result.map((item) => item.title)).toEqual(['Déclarer la naissance', 'Poser un congé']);
    expect(result[0]?.group).toBe('Démarches : naissance d’un enfant');
    expect(result[0]?.source).toEqual({ label: 'service-public.gouv.fr', url: 'https://www.service-public.gouv.fr/F1', verifiedOn: '2026-10-30' });
    expect(JSON.stringify(result[0]?.blocks)).toContain('Échéance : Dans les 5 jours.');
    expect(JSON.stringify(result[1]?.blocks)).not.toContain('Échéance');
    expect(new Set(result.map((item) => item.id)).size).toBe(2);
  });

  it('adds live entries in front of the « sources » section only', () => {
    const base: HelpSection[] = [sections[0]!, { id: 'regles', kind: 'sources', title: 'Règles', summary: '.', entries: [entry({ id: 'static', title: 'Statique' })] }];
    const merged = withLiveSources(base, [aidRuleToHelpEntry(rule)]);
    expect(merged[0]).toBe(base[0]);
    expect(merged[1]?.entries.map((item) => item.id)).toEqual(['regle-CREDIT', 'static']);
    expect(base[1]?.entries).toHaveLength(1);
  });
});

describe('helpAnchor', () => {
  it('prefixes section ids so they cannot clash with other ids on the page', () => {
    expect(helpAnchor('faq')).toBe('aide-faq');
  });
});
