import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_URL } from '../../domain/app-info';
import { HELP_SOURCES_DISCLAIMER, HelpBlock, HelpEntry, HelpLink } from '../../domain/help';
import { APP_ROUTES, isAppRoute } from '../../domain/routes';
import { HELP_SECTIONS } from './index';

const allEntries: HelpEntry[] = HELP_SECTIONS.flatMap((section) => [...section.entries]);
const allLinks: HelpLink[] = allEntries.flatMap((entry) => [...(entry.links ?? [])]);
const textOf = (block: HelpBlock): string[] => (block.type === 'list' ? [...block.items] : [block.text]);

describe('help content', () => {
  it('has the nine sections, in the order of the table of contents', () => {
    expect(HELP_SECTIONS.map((section) => section.title)).toEqual([
      'Pour commencer',
      'Le suivi au quotidien',
      'Épargne et projets',
      'Aides et démarches',
      'Mes données et ma confidentialité',
      'Règles officielles et sources',
      'Ce qui est prévu',
      'Questions fréquentes',
      'À propos',
    ]);
  });

  it('gives every section a unique, anchor-safe id', () => {
    const ids = HELP_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('gives every entry a unique id across the whole help', () => {
    const ids = allEntries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
  });

  it('has non-empty titles, summaries and texts', () => {
    HELP_SECTIONS.forEach((section) => {
      expect(section.title.trim()).not.toBe('');
      expect(section.summary.trim()).not.toBe('');
      expect(section.entries.length).toBeGreaterThan(0);
    });
    allEntries.forEach((entry) => {
      expect(entry.title.trim()).not.toBe('');
      expect(entry.blocks.length).toBeGreaterThan(0);
      entry.blocks.flatMap(textOf).forEach((text) => expect(text.trim()).not.toBe(''));
      (entry.links ?? []).forEach((link) => expect(link.label.trim()).not.toBe(''));
    });
  });

  it('only sends internal links to known screens', () => {
    const internal = allLinks.filter((link) => link.kind === 'internal');
    expect(internal.length).toBeGreaterThan(10);
    internal.forEach((link) => link.kind === 'internal' && expect(isAppRoute(link.to), link.to).toBe(true));
  });

  it('only uses https for external links', () => {
    [...allLinks.filter((link) => link.kind === 'external').map((link) => (link.kind === 'external' ? link.href : '')), ...allEntries.map((entry) => entry.source?.url ?? 'https://ok.test')].forEach(
      (href) => expect(new URL(href).protocol, href).toBe('https:'),
    );
  });

  it('keeps the list of known screens identical to the routes declared in App.tsx', () => {
    const source = readFileSync(resolve(__dirname, '../../presentation/App.tsx'), 'utf8');
    const declared = [...source.matchAll(/<Route\s+(?:index|path="([^"]+)")/g)].map((match) => (match[1] ? `/${match[1].replace(/^\//, '')}` : '/'));
    expect([...new Set(declared)].filter((path) => path !== '/login' && path !== '/*').sort()).toEqual([...APP_ROUTES].sort());
  });

  it('shows the banner on the official rules section and gives it the two static rows', () => {
    const rules = HELP_SECTIONS.find((section) => section.kind === 'sources');
    expect(rules?.disclaimer).toBe('Ce sont des repères et des estimations, pas des conseils juridiques ou fiscaux.');
    expect(rules?.disclaimer).toBe(HELP_SOURCES_DISCLAIMER);
    const titles = rules?.entries.map((entry) => entry.title) ?? [];
    expect(titles).toContain('Seuil d’endettement de 35 %');
    expect(titles).toContain('Participation des crèches (barème de la Caf)');
    rules?.entries.forEach((entry) => expect(entry.source).toBeDefined());
  });

  it('says honestly that the 35 % threshold is not a rule of law and that the crèche scale must be confirmed every year', () => {
    const rules = HELP_SECTIONS.find((section) => section.kind === 'sources');
    const debt = JSON.stringify(rules?.entries.find((entry) => entry.id === 'repere-endettement-35'));
    const creche = JSON.stringify(rules?.entries.find((entry) => entry.id === 'bareme-creche-psu'));
    expect(debt).toContain('pas une règle de droit');
    expect(creche).toContain('À confirmer chaque année');
    expect(creche).toMatch(/verifiedOn":"\d{4}-\d{2}-\d{2}/);
  });

  it('has at least ten frequently asked questions, including the four the owner asked for', () => {
    const faq = HELP_SECTIONS.find((section) => section.kind === 'faq');
    expect(faq?.entries.length).toBeGreaterThanOrEqual(10);
    ['Pourquoi mon solde de fin de mois est-il négatif ?', 'Pourquoi le commun a 0 € de revenus ?', 'Ma contribution est-elle obligatoire ?', 'Puis-je supprimer mes données ?'].forEach((question) =>
      expect(faq?.entries.map((entry) => entry.title)).toContain(question),
    );
  });

  it('states the encryption limit plainly: the host holds the key', () => {
    const privacy = JSON.stringify(HELP_SECTIONS.find((section) => section.id === 'donnees-confidentialite'));
    expect(privacy).toContain('la clé de chiffrement est détenue par l’hébergeur');
    expect(privacy).toContain('Il ne cache pas vos données à l’hébergeur');
  });

  it('mentions the course without inventing a link to it', () => {
    const start = JSON.stringify(HELP_SECTIONS[0]);
    expect(start).toContain('cours de finances familiales');
    expect(start).toContain('Leçon N du cours');
    expect(allLinks.filter((link) => link.kind === 'external' && /cours|lecon|leçon/i.test(link.label))).toEqual([]);
  });

  it('ends with an « À propos » that shows the version, and a repository link only when its address is known', () => {
    const about = HELP_SECTIONS[HELP_SECTIONS.length - 1];
    expect(about?.kind).toBe('about');
    expect(JSON.stringify(about)).toMatch(/Version \d+\.\d+\.\d+/);
    const external = (about?.entries[0]?.links ?? []).filter((link) => link.kind === 'external');
    expect(external).toHaveLength(REPOSITORY_URL ? 1 : 0);
  });

  it('contains no markup that would show up as raw characters', () => {
    allEntries.flatMap((entry) => [entry.title, ...entry.blocks.flatMap(textOf)]).forEach((text) => {
      expect(text).not.toMatch(/\*\*|<\/?[a-z]+>|\[[^\]]+\]\(/);
    });
  });
});
