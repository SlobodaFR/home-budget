import { HelpSection } from '../../domain/help';

export const aidesDemarches: HelpSection = {
  id: 'aides-demarches',
  kind: 'guide',
  title: 'Aides et démarches',
  summary: 'Les aides officielles (crédits d’impôt, tarif de crèche) et les événements de vie comme une naissance.',
  keywords: ['impôts', 'caf', 'bébé'],
  entries: [
    {
      id: 'aides-officielles',
      title: 'Les aides officielles',
      blocks: [
        {
          type: 'paragraph',
          text: 'Certaines dépenses de l’espace commun donnent droit à un crédit d’impôt : la garde d’enfants de moins de 6 ans hors du domicile (crèche, assistante maternelle…) et les services à la personne à domicile (ménage, jardinage, soutien scolaire…).',
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'Remplissez votre profil fiscal : nombre d’enfants de moins de 6 ans, nombre d’enfants à charge, et s’il s’agit de votre première année d’emploi à domicile.',
            'Rattachez vos paiements récurrents de l’espace commun à l’aide qui leur correspond.',
            'La page Aides calcule, année par année, le crédit d’impôt attendu, la part du plafond déjà utilisée et le coût net de la dépense.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Le crédit d’impôt est versé l’été de l’année suivante, après la déclaration de revenus. Les taux et les plafonds sont dans « Règles officielles et sources ».',
        },
        { type: 'note', text: 'Ce sont des estimations, pas un conseil fiscal. En cas de doute, la source officielle ou votre centre des impôts font foi.' },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les aides', to: '/aides' }],
      keywords: ['crédit d’impôt', 'garde', 'enfants', 'services à la personne', 'ménage', 'profil fiscal', 'impôts'],
    },
    {
      id: 'estimateur-de-creche',
      title: 'Estimer le tarif d’une crèche',
      blocks: [
        {
          type: 'paragraph',
          text: 'Pour une crèche collective ou une micro-crèche, le tarif dépend des revenus du foyer et du nombre d’enfants. Indiquez vos revenus annuels (ils figurent sur votre avis d’impôt), le nombre d’enfants et le nombre d’heures facturées par mois : l’estimateur donne la facture mensuelle probable.',
        },
        {
          type: 'paragraph',
          text: 'Votre crèche reste seule à fixer le tarif exact : prenez le résultat comme un ordre de grandeur. Le barème utilisé est décrit dans « Règles officielles et sources ».',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’estimateur de crèche', to: '/aides' }],
      keywords: ['crèche', 'micro-crèche', 'tarif', 'garde', 'participation familiale', 'psu'],
    },
    {
      id: 'evenements-de-vie',
      title: 'Les événements de vie : la naissance',
      blocks: [
        {
          type: 'paragraph',
          text: 'Une naissance s’accompagne de beaucoup de démarches faciles à oublier : mairie, Caf, impôts, employeur, santé… Ajoutez la naissance (prévue ou réelle) et l’application dresse la liste des démarches avec leurs échéances.',
        },
        {
          type: 'list',
          items: [
            'Chaque démarche renvoie à sa source officielle.',
            'Vous cochez ce qui est fait ; les démarches en retard ou à faire bientôt passent en premier.',
            'Vous pouvez ajouter une note à une démarche. Toute la famille voit cette note : n’y mettez rien de sensible (numéro de dossier, mot de passe, santé).',
            'La date de l’événement peut aller de 24 mois avant à 18 mois après aujourd’hui.',
          ],
        },
        { type: 'paragraph', text: 'Les démarches sont les mêmes pour tout le foyer. Aujourd’hui, seule la naissance est proposée.' },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les démarches', to: '/evenements' }],
      keywords: ['naissance', 'bébé', 'mairie', 'caf', 'congé', 'démarches', 'échéance'],
    },
  ],
};
