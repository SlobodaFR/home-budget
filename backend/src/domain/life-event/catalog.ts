/**
 * Catalogue des événements de vie (tranche 11) : du CODE versionné, pas des données.
 *
 * RÈGLE D'OR : une étape n'entre dans ce catalogue que si son contenu (délai, condition,
 * nom du dispositif) a été relu sur une source OFFICIELLE (service-public.gouv.fr, caf.fr,
 * impots.gouv.fr, ameli.fr, travail-emploi.gouv.fr…), citée dans `sourceUrl`. Une information
 * non confirmée ne figure pas ici, même plausible. `verifiedOn` est la date de cette relecture :
 * à mettre à jour quand on revérifie, et à revérifier au plus tard à chaque réforme annoncée.
 *
 * Conventions :
 * - Formulation prudente (« généralement », « à vérifier selon votre situation ») dès que les
 *   conditions varient ; AUCUN montant en euros (ils changent chaque année et dépendent des
 *   ressources) : on renvoie à la source.
 * - `dueOffsetDays` n'est renseigné que si l'échéance se déduit de façon certaine de la date de
 *   l'événement ET compte en jours (déclaration en mairie : 5 jours ; impôts : 60 jours). Les
 *   délais en mois (« dans les 6 mois », « au 7e mois de grossesse ») ou relatifs à une date que
 *   l'utilisateur choisit (début d'un congé) restent à `null` avec un `dueLabel` : ils ne
 *   deviendront jamais « en retard » à tort.
 * - Ce sont des repères, pas un conseil juridique ou fiscal.
 *
 * Note de nommage (relu le 2026-10-30) : le « congé de naissance » de 3 jours, le « congé de
 * paternité et d'accueil de l'enfant » (25 jours) et le « congé supplémentaire de naissance »
 * (1 ou 2 mois par parent, depuis le 1er juillet 2026) sont trois congés distincts qui se cumulent.
 *
 * Le domaine service-public.fr redirige désormais vers service-public.gouv.fr : on cite ce dernier.
 */

export const LIFE_EVENT_TYPES = ['BIRTH'] as const;
export type LifeEventType = (typeof LIFE_EVENT_TYPES)[number];

export const STEP_CATEGORIES = [
  'ADMIN',
  'AIDES',
  'SANTE',
  'TRAVAIL',
  'BUDGET',
] as const;
export type StepCategory = (typeof STEP_CATEGORIES)[number];

/** Routes de l'application vers lesquelles une étape peut renvoyer. */
export const STEP_LINKS = [
  '/aides',
  '/plan',
  '/previsionnel',
  '/projets',
  '/comptes',
] as const;
export type StepLink = (typeof STEP_LINKS)[number];

export interface CatalogStep {
  /** Stable : c'est la clé de l'état « fait » enregistré. Ne jamais le réutiliser pour autre chose. */
  id: string;
  title: string;
  detail: string;
  category: StepCategory;
  /** Jours par rapport à la date de l'événement (négatif = avant), null = pas d'échéance fixe. */
  dueOffsetDays: number | null;
  dueLabel: string | null;
  sourceLabel: string;
  /** URL https de la source officielle relue. */
  sourceUrl: string;
  /** AAAA-MM-JJ : date de la dernière relecture de la source. */
  verifiedOn: string;
  link: StepLink | null;
}

export interface LifeEventDefinition {
  type: LifeEventType;
  label: string;
  description: string;
  steps: readonly CatalogStep[];
}

const VERIFIED_ON = '2026-10-30';

const SP = 'service-public.gouv.fr';
const SP_BASE = 'https://www.service-public.gouv.fr/particuliers/vosdroits';

const BIRTH_STEPS: readonly CatalogStep[] = [
  {
    id: 'birth-pregnancy-declaration',
    title: 'Déclarer la grossesse',
    detail:
      "Le premier examen prénatal est prévu avant la fin du 3e mois. Généralement, le médecin ou la sage-femme fait la déclaration en ligne et vous n'avez rien à faire ; sinon, le formulaire papier est à envoyer dans les 14 premières semaines à l'Assurance maladie et à la Caf (ou à la MSA). Elle permet la prise en charge de la grossesse et le versement des futures prestations familiales. À ignorer si c'est déjà fait.",
    category: 'SANTE',
    dueOffsetDays: null,
    dueLabel: 'Avant la fin du 3e mois de grossesse',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F968`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-nursery-search',
    title: "Chercher un mode d'accueil (crèche…)",
    detail:
      "Les places en crèche sont limitées : mieux vaut s'y prendre dès la grossesse et pré-inscrire l'enfant le plus tôt possible. Pour une crèche publique, renseignez-vous auprès de votre mairie ; pour une crèche associative ou privée, contactez directement la direction. La liste des pièces demandées varie d'une commune ou d'un établissement à l'autre ; un relais petite enfance peut vous conseiller.",
    category: 'ADMIN',
    dueOffsetDays: null,
    dueLabel: 'Dès la grossesse, le plus tôt possible',
    sourceLabel: 'monenfant.fr (Caf)',
    sourceUrl: 'https://monenfant.fr/choisir-un-mode-d-accueil-collectif',
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-recognition',
    title: "Reconnaître l'enfant (parents non mariés)",
    detail:
      "Pour la mère, la filiation est établie par l'acte de naissance. Pour le père non marié, elle n'est pas automatique : la reconnaissance peut se faire avant la naissance, lors de la déclaration de naissance ou après, dans n'importe quelle mairie (ou devant notaire). Dans un couple de femmes, une reconnaissance conjointe anticipée est nécessaire. Sans objet si les parents sont mariés : à vérifier selon votre situation.",
    category: 'ADMIN',
    dueOffsetDays: null,
    dueLabel: 'Avant ou après la naissance, sans délai fixe',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F887`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-declaration',
    title: 'Déclarer la naissance à la mairie',
    detail:
      "À faire dans les 5 jours qui suivent la naissance (jour de l'accouchement non compté) ; si le dernier jour tombe un samedi, un dimanche ou un jour férié ou chômé, le délai est reporté au premier jour ouvrable suivant. Généralement faite par le père, la mère dans un couple de femmes, le médecin, la sage-femme ou le responsable de la maternité. Pièces généralement demandées : pièces d'identité des parents, certificat d'accouchement et livret de famille s'il existe. Le prénom se choisit à cette occasion. Délais différents en Guyane et à l'étranger : à vérifier selon votre situation.",
    category: 'ADMIN',
    dueOffsetDays: 5,
    dueLabel: 'Dans les 5 jours après la naissance',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F961`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-family-booklet',
    title: 'Récupérer le livret de famille',
    detail:
      "À la naissance du premier enfant, le livret de famille est établi par l'officier d'état civil et remis gratuitement par la mairie du lieu de naissance, sur présentation d'une pièce d'identité. Il sert généralement de justificatif pour d'autres démarches (Assurance maladie, Caf).",
    category: 'ADMIN',
    dueOffsetDays: null,
    dueLabel: 'Après la déclaration de naissance',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F11991`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-health-insurance',
    title: "Déclarer la naissance à l'Assurance maladie",
    detail:
      "Pour ouvrir les droits de l'enfant, la naissance se déclare généralement en ligne depuis votre compte ameli quelques jours après la déclaration en mairie (ou par téléphone au 3646) ; au régime agricole, envoyez l'acte de naissance à la MSA. L'enfant peut être rattaché à l'un des parents ou aux deux. Les pièces demandées (livret de famille ou acte de naissance) peuvent varier : à vérifier selon votre situation.",
    category: 'SANTE',
    dueOffsetDays: null,
    dueLabel: 'Quelques jours après la déclaration en mairie',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F737`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-first-medical-exam',
    title: "Faire passer le premier examen médical de l'enfant",
    detail:
      "Des examens médicaux obligatoires jalonnent l'enfance, dont un dans les 8 jours qui suivent la naissance (le médecin remplit alors le 1er certificat de santé). Les consultations sont généralement remboursées à 100 % sans avance de frais, hors dépassement d'honoraires. Les résultats sont consignés dans le carnet de santé. Le calendrier complet est sur la fiche officielle.",
    category: 'SANTE',
    dueOffsetDays: 8,
    dueLabel: 'Dans les 8 jours après la naissance',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F967`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-caf-declaration',
    title: 'Déclarer la naissance à la Caf',
    detail:
      "La Caf demande de déclarer l'enfant dès la naissance pour bénéficier de vos droits : depuis « Mon Compte » sur caf.fr (ou l'application), en déclarant un changement puis une naissance. Elle ne demande généralement pas l'acte de naissance. Les aides possibles dépendent de votre situation et de vos ressources.",
    category: 'AIDES',
    dueOffsetDays: null,
    dueLabel: 'Dès la naissance',
    sourceLabel: 'caf.fr',
    sourceUrl:
      'https://www.caf.fr/allocataires/caf-du-nord/actualites-departementales/comment-declarer-la-naissance-de-mon-enfant',
    verifiedOn: VERIFIED_ON,
    link: '/aides',
  },
  {
    id: 'birth-birth-premium',
    title: 'Vérifier la prime à la naissance',
    detail:
      "Sous conditions de ressources, la prime à la naissance (Paje) est généralement versée par la Caf (ou la MSA) avant la fin du mois qui suit le 6e mois de grossesse. Elle suppose notamment d'avoir passé le premier examen prénatal et déclaré la grossesse avant la fin du 3e mois. À vérifier selon votre situation ; le montant dépend de votre dossier, voir la Caf.",
    category: 'AIDES',
    dueOffsetDays: null,
    dueLabel: 'Versée vers le 7e mois de grossesse',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F2550`,
    verifiedOn: VERIFIED_ON,
    link: '/aides',
  },
  {
    id: 'birth-basic-allowance',
    title: "Vérifier l'allocation de base (Paje)",
    detail:
      "Sous conditions de ressources, l'allocation de base est généralement versée chaque mois pour un enfant de moins de 3 ans, à compter du premier jour du mois qui suit la naissance. Renseignez-vous auprès de votre Caf (ou de la MSA) sur les justificatifs éventuels à fournir.",
    category: 'AIDES',
    dueOffsetDays: null,
    dueLabel: 'À partir du mois suivant la naissance',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F2552`,
    verifiedOn: VERIFIED_ON,
    link: '/aides',
  },
  {
    id: 'birth-childcare-cmg',
    title: 'Estimer le complément de libre choix du mode de garde (CMG)',
    detail:
      "Si vous faites garder l'enfant (assistant maternel, garde à domicile, structure d'accueil), le CMG peut financer une partie des frais. Son calcul a été réformé au 1er septembre 2025 : il tient compte des ressources du foyer, du nombre d'enfants, du coût horaire et des heures de garde. La demande se fait sur caf.fr ; à vérifier selon votre situation.",
    category: 'AIDES',
    dueOffsetDays: null,
    dueLabel: 'Avant le début de la garde',
    sourceLabel: 'caf.fr',
    sourceUrl:
      'https://www.caf.fr/allocataires/actualites/actualites-nationales/reforme-du-cmg-une-aide-plus-adaptee-pour-les-familles',
    verifiedOn: VERIFIED_ON,
    link: '/aides',
  },
  {
    id: 'birth-tax-declaration',
    title: 'Signaler la naissance aux impôts',
    detail:
      "Déclarez la naissance dans les 60 jours qui suivent l'événement depuis votre espace particulier sur impots.gouv.fr (« Gérer mon prélèvement à la source », puis « Signaler un changement ») : votre taux de prélèvement à la source est adapté à la nouvelle composition du foyer. L'enfant sera aussi à inscrire sur la prochaine déclaration de revenus ; il donne généralement droit à une demi-part ou une part supplémentaire pour l'année de sa naissance, à vérifier selon votre situation.",
    category: 'BUDGET',
    dueOffsetDays: 60,
    dueLabel: 'Dans les 60 jours après la naissance',
    sourceLabel: 'impots.gouv.fr',
    sourceUrl:
      'https://www.impots.gouv.fr/particulier/questions/jai-eu-un-enfant-quelles-demarches-dois-je-accomplir',
    verifiedOn: VERIFIED_ON,
    link: '/previsionnel',
  },
  {
    id: 'birth-childcare-tax-credit',
    title: "Prévoir le crédit d'impôt pour la garde hors du domicile",
    detail:
      "Pour un enfant de moins de 6 ans au 1er janvier de l'année d'imposition, gardé par une assistante maternelle agréée ou dans une structure d'accueil (crèche, halte-garderie…), les sommes ouvrant droit au crédit d'impôt se déclarent sur la déclaration de revenus, après déduction des aides reçues (par exemple le CMG). Conservez les justificatifs (attestation fiscale Pajemploi pour une assistante maternelle). Conditions à vérifier selon votre situation.",
    category: 'BUDGET',
    dueOffsetDays: null,
    dueLabel: "Sur la déclaration de revenus de l'année suivante",
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F8`,
    verifiedOn: VERIFIED_ON,
    link: '/aides',
  },
  {
    id: 'birth-leave-maternity',
    title: "Prévenir l'employeur du congé de maternité (salariée du privé)",
    detail:
      "Prévenez votre employeur par lettre recommandée avec avis de réception (ou remise contre récépissé), en indiquant les dates présumées de début et de fin du congé et en joignant le certificat médical précisant la date présumée de l'accouchement. Pour un 1er ou 2e enfant, le congé dure généralement 16 semaines (6 avant, 10 après) ; il est plus long dès le 3e enfant ou en cas de naissances multiples, et les conventions collectives peuvent prévoir mieux. Les indemnités journalières sont versées par l'Assurance maladie.",
    category: 'TRAVAIL',
    dueOffsetDays: null,
    dueLabel: 'Avant le début du congé',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F2265`,
    verifiedOn: VERIFIED_ON,
    link: '/previsionnel',
  },
  {
    id: 'birth-leave-birth-3-days',
    title: 'Poser le congé de naissance de 3 jours (salarié du privé)',
    detail:
      "Le congé de naissance dure 3 jours ouvrables et commence, au choix du salarié, le jour de la naissance ou le premier jour ouvrable suivant. Les jours sont payés comme du temps de travail. Il n'est pas cumulable avec le congé de maternité ; une copie de l'acte de naissance est à remettre à l'employeur. Les règles diffèrent dans la fonction publique : à vérifier selon votre situation.",
    category: 'TRAVAIL',
    dueOffsetDays: null,
    dueLabel: 'À partir du jour de la naissance',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F2266`,
    verifiedOn: VERIFIED_ON,
    link: null,
  },
  {
    id: 'birth-leave-paternity',
    title:
      "Prévoir le congé de paternité et d'accueil de l'enfant (salarié du privé)",
    detail:
      "Après le congé de naissance, ce congé dure 25 jours calendaires (32 en cas de naissances multiples), dont 4 jours obligatoires pris juste après le congé de naissance ; le reste est facultatif, en une fois ou fractionné en 2 périodes au plus. Il se prend généralement dans les 6 mois suivant la naissance. Prévenez l'employeur au moins 1 mois avant le début du congé. Les indemnités journalières sont versées par l'Assurance maladie, sous conditions. Il ne remplace pas le congé supplémentaire de naissance.",
    category: 'TRAVAIL',
    dueOffsetDays: null,
    dueLabel: 'Dans les 6 mois après la naissance (prévenir 1 mois avant)',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F3156`,
    verifiedOn: VERIFIED_ON,
    link: '/previsionnel',
  },
  {
    id: 'birth-leave-supplementary',
    title:
      'Se renseigner sur le congé supplémentaire de naissance (salarié du privé)',
    detail:
      "Nouveau congé ouvert depuis le 1er juillet 2026 : chaque parent peut généralement choisir 1 ou 2 mois, pris en une fois ou fractionnés, à condition d'avoir pris auparavant un congé de maternité, de paternité ou d'adoption. Pour un enfant né à partir du 1er juillet 2026, il se prend généralement dans les 9 mois suivant la naissance ; un régime transitoire existe pour les naissances de janvier à juin 2026. Prévenez l'employeur au moins 1 mois avant (15 jours s'il suit directement le congé de paternité). Il est indemnisé par l'Assurance maladie, sans cumul avec certaines autres indemnités : voir la fiche officielle.",
    category: 'TRAVAIL',
    dueOffsetDays: null,
    dueLabel: 'Dans les 9 mois après la naissance (prévenir 1 mois avant)',
    sourceLabel: SP,
    sourceUrl: `${SP_BASE}/F39685`,
    verifiedOn: VERIFIED_ON,
    link: '/previsionnel',
  },
  {
    id: 'birth-budget-review',
    title: "Revoir le budget du foyer avec l'arrivée de l'enfant",
    detail:
      "L'arrivée d'un enfant entraîne de nouvelles dépenses (couches, alimentation, équipements, frais de garde selon le mode d'accueil choisi) : il est conseillé de revoir le budget familial en les intégrant, idéalement avant la naissance, puis d'ajuster les blocs du plan et le prévisionnel avec les aides que vous aurez confirmées.",
    category: 'BUDGET',
    dueOffsetDays: null,
    dueLabel: 'Idéalement avant la naissance',
    sourceLabel: 'mesquestionsdargent.fr (Banque de France)',
    sourceUrl: 'https://www.mesquestionsdargent.fr/budget/budget-enfant',
    verifiedOn: VERIFIED_ON,
    link: '/plan',
  },
];

export const LIFE_EVENT_CATALOG: readonly LifeEventDefinition[] = [
  {
    type: 'BIRTH',
    label: "Naissance d'un enfant",
    description: "Les démarches et aides à prévoir autour d'une naissance.",
    steps: BIRTH_STEPS,
  },
];

export function findDefinition(type: string): LifeEventDefinition | undefined {
  return LIFE_EVENT_CATALOG.find((d) => d.type === type);
}
