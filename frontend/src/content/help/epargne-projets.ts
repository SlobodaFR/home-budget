import { HelpSection } from '../../domain/help';

export const epargneProjets: HelpSection = {
  id: 'epargne-projets',
  kind: 'guide',
  title: 'Épargne et projets',
  summary: 'L’épargne de sécurité, les projets d’épargne, les provisions pour les paiements non mensuels, les crédits et dettes.',
  keywords: ['économiser', 'mettre de côté'],
  entries: [
    {
      id: 'epargne-de-securite',
      title: 'L’épargne de sécurité',
      blocks: [
        {
          type: 'paragraph',
          text: 'C’est la réserve qui permet de faire face à un coup dur sans paniquer. Dans la page Foyer, vous indiquez le montant déjà épargné à une date donnée et le nombre de mois de dépenses que vous voulez couvrir (de 1 à 24 mois, 3 mois par défaut).',
        },
        {
          type: 'paragraph',
          text: 'L’application compare ensuite cette épargne à vos dépenses mensuelles de référence (le plan commun ou, à défaut, la moyenne des 3 derniers mois) et vous dit combien de mois sont couverts. Les sommes que vous versez ensuite dans le bloc Épargne du commun s’ajoutent automatiquement.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['réserve', 'coup dur', 'mois de dépenses', 'sécurité'],
    },
    {
      id: 'projets-depargne',
      title: 'Les projets d’épargne',
      blocks: [
        {
          type: 'paragraph',
          text: 'Un projet est un objectif avec une date : des vacances, une naissance, une voiture, des travaux. Vous choisissez le montant visé et la date ; l’application vous dit combien mettre de côté chaque mois et si vous êtes dans le rythme.',
        },
        {
          type: 'paragraph',
          text: 'Des modèles (Naissance, Vacances, Voiture, Travaux, Autre) préremplissent le nom et une échéance raisonnable. Aucun montant n’est imposé. Vous notez ensuite vos versements au fil des mois.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les projets', to: '/projets' }],
      keywords: ['objectif', 'vacances', 'voiture', 'travaux', 'naissance', 'versement'],
    },
    {
      id: 'provisions',
      title: 'Provisions : les paiements qui ne tombent pas chaque mois',
      blocks: [
        {
          type: 'paragraph',
          text: 'La taxe foncière, une assurance annuelle, un impôt, les vacances : ces paiements ne passent pas chaque mois et peuvent déséquilibrer un budget mensuel. L’idée est de les lisser en mettant un peu de côté chaque mois.',
        },
        {
          type: 'list',
          items: [
            'Notez le paiement comme récurrent, avec le rythme « chaque trimestre » ou « chaque année ».',
            'L’onglet « Provisions » du prévisionnel indique la somme à mettre de côté chaque mois : le montant divisé par 12 pour un paiement annuel, par 3 pour un paiement trimestriel.',
            'L’onglet « Année » montre les 12 mois à venir et repère les mois chargés.',
          ],
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le prévisionnel', to: '/previsionnel' }],
      keywords: ['non mensuel', 'annuel', 'trimestriel', 'taxe foncière', 'lisser', 'provision'],
    },
    {
      id: 'credits-et-dettes',
      title: 'Crédits et dettes',
      blocks: [
        {
          type: 'paragraph',
          text: 'Notez vos crédits (immobilier, auto, consommation, études…) pour voir d’un coup d’œil combien il reste à rembourser, quand ils se termineront et combien d’intérêts restent à payer. Il vous faut le tableau d’amortissement ou le relevé de la banque.',
        },
        {
          type: 'paragraph',
          text: 'Le simulateur « et si je remboursais plus vite ? » montre l’effet d’un versement mensuel en plus ou d’un remboursement exceptionnel sur la durée et sur les intérêts.',
        },
        {
          type: 'paragraph',
          text: 'Un repère s’affiche aussi : la part des revenus consacrée aux mensualités, à comparer au seuil de 35 %. C’est un repère, pas une règle. Tous ces chiffres sont des estimations.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les crédits', to: '/dettes' }],
      keywords: ['prêt', 'emprunt', 'remboursement', 'endettement', 'intérêts', 'simulateur', '35'],
    },
  ],
};
