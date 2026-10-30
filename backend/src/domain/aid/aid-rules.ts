/**
 * Catalogue des aides officielles gérées par l'application. Ce sont des règles
 * versionnées dans le code (jamais saisies par l'utilisateur) : chacune porte sa
 * source et la date à laquelle elle a été vérifiée. Les calculs qui en
 * découlent sont des ESTIMATIONS, pas un conseil fiscal.
 */
export const AID_RULE_IDS = [
  'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
  'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
] as const;
export type AidRuleId = (typeof AID_RULE_IDS)[number];

export interface AidRule {
  id: AidRuleId;
  label: string;
  description: string;
  /** Taux entier du crédit (50 = 50 %). */
  ratePercent: number;
  /** Plafond en clair (les montants exacts sont calculés par `aidCapCents`). */
  capDescription: string;
  cashTiming: string;
  sourceLabel: string;
  sourceUrl: string;
  /** Date (AAAA-MM-JJ) de la dernière vérification de la règle à la source. */
  verifiedOn: string;
}

export const AID_RULES: readonly AidRule[] = [
  {
    id: 'CREDIT_IMPOT_GARDE_HORS_DOMICILE',
    label: "Garde d'enfants de moins de 6 ans hors du domicile",
    description:
      'Crèche, assistante maternelle agréée, halte-garderie, garderie périscolaire… Les frais retenus sont nets des aides perçues (par exemple le complément de libre choix du mode de garde) : saisissez le montant restant à votre charge.',
    ratePercent: 50,
    capDescription:
      '3 500 € de frais par enfant de moins de 6 ans (soit 1 750 € de crédit au maximum)',
    cashTiming:
      "Versé l'été de l'année suivante, après la déclaration de revenus (case frais de garde, formulaire 2042 RICI).",
    sourceLabel: 'impots.gouv.fr',
    sourceUrl:
      'https://www.impots.gouv.fr/particulier/questions/je-fais-garder-mon-jeune-enfant-lexterieur-du-domicile-que-puis-je-deduire',
    verifiedOn: '2026-10-30',
  },
  {
    id: 'CREDIT_IMPOT_SERVICES_A_LA_PERSONNE',
    label: 'Services à la personne à domicile',
    description:
      "Ménage, vitres, jardinage, garde à domicile, soutien scolaire… Non gérés par l'estimation : le plafond de 20 000 € en cas d'invalidité, la majoration pour les personnes de plus de 65 ans, la résidence alternée et les sous-plafonds (jardinage, assistance informatique, bricolage).",
    ratePercent: 50,
    capDescription:
      "12 000 € de dépenses par an, plus 1 500 € par enfant à charge, dans la limite de 15 000 € (première année d'emploi à domicile : 15 000 € plus 1 500 € par enfant, dans la limite de 18 000 €)",
    cashTiming:
      "Versé l'été de l'année suivante, après la déclaration de revenus (case emploi à domicile, formulaire 2042 RICI).",
    sourceLabel: 'impots.gouv.fr',
    sourceUrl: 'https://www.impots.gouv.fr/particulier/emploi-domicile',
    verifiedOn: '2026-10-30',
  },
];

export function isAidRuleId(value: unknown): value is AidRuleId {
  return (
    typeof value === 'string' &&
    (AID_RULE_IDS as readonly string[]).includes(value)
  );
}

export function getAidRule(id: AidRuleId): AidRule {
  return AID_RULES.find((rule) => rule.id === id)!;
}
