import { AidRule } from './aids';
import { AppRoute } from './routes';
import { LifeEventDefinition } from './life-event';

// ---------------------------------------------------------------------------------------------------------------------
// Les données de l'aide : du contenu structuré, sans mise en forme. La présentation décide comment l'afficher.
// ---------------------------------------------------------------------------------------------------------------------

export type HelpLink =
  | { kind: 'internal'; label: string; to: AppRoute }
  | { kind: 'external'; label: string; href: string };

export type HelpBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: readonly string[]; ordered?: boolean }
  /** Une remarque à ne pas manquer (une limite, une précaution). */
  | { type: 'note'; text: string };

export interface HelpSource {
  label: string;
  /** `null` : aucune source en ligne (par exemple un repère pédagogique). */
  url: string | null;
  /** `AAAA-MM-JJ`, ou `null` quand il n'y a rien à vérifier à la source. */
  verifiedOn: string | null;
}

export interface HelpEntry {
  /** Unique dans toute l'aide. */
  id: string;
  title: string;
  blocks: readonly HelpBlock[];
  links?: readonly HelpLink[];
  /** Mots que l'on peut taper sans qu'ils figurent dans le texte (« argent », « csv »…). */
  keywords?: readonly string[];
  /** Regroupe des entrées consécutives sous un même sous-titre. */
  group?: string;
  source?: HelpSource;
}

/** `guide` : des articles ; `sources` : les règles officielles ; `faq` : questions et réponses ; `about` : la fiche de l'application. */
export type HelpSectionKind = 'guide' | 'sources' | 'faq' | 'about';

export interface HelpSection {
  /** Unique ; sert d'ancre dans le sommaire. */
  id: string;
  kind: HelpSectionKind;
  title: string;
  summary: string;
  keywords?: readonly string[];
  /** Un bandeau affiché en tête de la section. */
  disclaimer?: string;
  entries: readonly HelpEntry[];
}

export const HELP_SOURCES_DISCLAIMER = 'Ce sont des repères et des estimations, pas des conseils juridiques ou fiscaux.';
export const HELP_SOURCES_SECTION_ID = 'regles-sources';

export function helpAnchor(sectionId: string): string {
  return `aide-${sectionId}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Recherche : insensible à la casse et aux accents, tous les mots tapés doivent se retrouver.
// ---------------------------------------------------------------------------------------------------------------------

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/** Les mots de la recherche, sans accents ; un « s » ou « x » final est ignoré pour que « crèches » trouve « crèche ». */
export function searchTokens(query: string): string[] {
  return normalizeForSearch(query)
    .split(/[\s']+/)
    .filter((token) => token !== '')
    .map((token) => (token.length > 3 ? token.replace(/[sx]$/, '') : token));
}

export function isSearching(query: string): boolean {
  return searchTokens(query).length > 0;
}

function blockText(block: HelpBlock): string {
  return block.type === 'list' ? block.items.join(' ') : block.text;
}

function entryText(entry: HelpEntry): string {
  return [
    entry.title,
    entry.group ?? '',
    ...entry.blocks.map(blockText),
    ...(entry.links ?? []).map((link) => link.label),
    ...(entry.keywords ?? []),
    entry.source?.label ?? '',
  ].join(' ');
}

function sectionText(section: HelpSection): string {
  return [section.title, section.summary, ...(section.keywords ?? [])].join(' ');
}

function containsAll(text: string, tokens: readonly string[]): boolean {
  const haystack = normalizeForSearch(text);
  return tokens.every((token) => haystack.includes(token));
}

/** Une entrée correspond si tous les mots se trouvent dans le titre de sa section et dans elle-même. */
export function entryMatches(section: HelpSection, entry: HelpEntry, query: string): boolean {
  const tokens = searchTokens(query);
  return tokens.length === 0 || containsAll(`${section.title} ${entryText(entry)}`, tokens);
}

/**
 * Les sections à afficher pour une recherche. Sans recherche, tout. Si la recherche correspond au titre ou au résumé d'une
 * section, elle est gardée en entier ; sinon, seules ses entrées correspondantes le sont, et une section sans entrée disparaît.
 */
export function filterSections(sections: readonly HelpSection[], query: string): HelpSection[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [...sections];
  }
  const result: HelpSection[] = [];
  for (const section of sections) {
    if (containsAll(sectionText(section), tokens)) {
      result.push(section);
      continue;
    }
    const entries = section.entries.filter((entry) => entryMatches(section, entry, query));
    if (entries.length > 0) {
      result.push({ ...section, entries });
    }
  }
  return result;
}

export function countEntries(sections: readonly HelpSection[]): number {
  return sections.reduce((total, section) => total + section.entries.length, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Regroupement des entrées
// ---------------------------------------------------------------------------------------------------------------------

export interface HelpEntryGroup {
  title: string | null;
  entries: HelpEntry[];
}

/** Les groupes dans l'ordre de leur première entrée ; les entrées sans groupe forment un groupe sans titre. */
export function groupEntries(entries: readonly HelpEntry[]): HelpEntryGroup[] {
  const groups: HelpEntryGroup[] = [];
  for (const entry of entries) {
    const title = entry.group ?? null;
    const existing = groups.find((group) => group.title === title);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.push({ title, entries: [entry] });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------------------------------
// Les règles venues du serveur, présentées comme des entrées de l'aide
// ---------------------------------------------------------------------------------------------------------------------

export const AID_RULES_GROUP = 'Aides et crédits d’impôt';
export const LIFE_EVENT_GROUP_PREFIX = 'Démarches';

export function aidRuleToHelpEntry(rule: AidRule): HelpEntry {
  return {
    id: `regle-${rule.id}`,
    title: rule.label,
    group: AID_RULES_GROUP,
    blocks: [
      { type: 'paragraph', text: rule.description },
      {
        type: 'list',
        items: [`Taux : ${rule.ratePercent} % de crédit d’impôt.`, `Plafond : ${rule.capDescription}.`, `Quand l’argent arrive : ${rule.cashTiming}`],
      },
    ],
    source: { label: rule.sourceLabel, url: rule.sourceUrl, verifiedOn: rule.verifiedOn },
  };
}

export function catalogToHelpEntries(definitions: readonly LifeEventDefinition[]): HelpEntry[] {
  return definitions.flatMap((definition) =>
    definition.steps.map<HelpEntry>((step) => ({
      id: `demarche-${definition.type}-${step.id}`,
      title: step.title,
      group: `${LIFE_EVENT_GROUP_PREFIX} : ${definition.label.charAt(0).toLowerCase()}${definition.label.slice(1)}`,
      blocks: [
        { type: 'paragraph', text: step.detail },
        ...(step.dueLabel ? [{ type: 'paragraph', text: `Échéance : ${step.dueLabel}.` } as const] : []),
      ],
      source: { label: step.sourceLabel, url: step.sourceUrl, verifiedOn: step.verifiedOn },
    })),
  );
}

/** Ajoute les règles venues du serveur en tête de la section « Règles officielles » ; les autres sections ne changent pas. */
export function withLiveSources(sections: readonly HelpSection[], live: readonly HelpEntry[]): HelpSection[] {
  return sections.map((section) => (section.kind === 'sources' ? { ...section, entries: [...live, ...section.entries] } : section));
}
