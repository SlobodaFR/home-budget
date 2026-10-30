import { HelpSection } from '../../domain/help';

export const pourCommencer: HelpSection = {
  id: 'pour-commencer',
  kind: 'guide',
  title: 'Pour commencer',
  summary: 'À quoi sert l’application, le foyer, l’espace commun et l’espace perso, les 4 blocs, le plan et la saisie d’une opération.',
  keywords: ['débuter', 'démarrer', 'premiers pas', 'tutoriel'],
  entries: [
    {
      id: 'a-quoi-sert-lapplication',
      title: 'À quoi sert l’application ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Foyer Budget aide votre famille à voir clairement où va l’argent : ce qui rentre, ce qui sort et ce que l’on met de côté. Elle est pensée d’abord pour le téléphone.',
        },
        {
          type: 'paragraph',
          text: 'Elle s’appuie sur un cours de finances familiales : ranger ses dépenses en 4 blocs, se constituer une épargne de sécurité et faire un point chaque mois.',
        },
        {
          type: 'note',
          text: 'Les conseils de l’accueil citent parfois « Leçon N du cours ». Le cours n’est pas hébergé dans l’application : ce numéro est une simple référence, il n’y a pas de lien à suivre.',
        },
      ],
      keywords: ['cours', 'finances familiales', 'leçon', 'budget'],
    },
    {
      id: 'le-foyer',
      title: 'Le foyer',
      blocks: [
        {
          type: 'paragraph',
          text: 'Un foyer réunit jusqu’à 4 personnes. Une personne le crée, les autres le rejoignent avec un code d’invitation, valable 7 jours et utilisable une seule fois. Le code se génère depuis la page Foyer. Une personne ne peut appartenir qu’à un seul foyer.',
        },
        {
          type: 'paragraph',
          text: 'Chacun peut indiquer son revenu net mensuel : il sert à calculer la part de chacun dans les dépenses communes.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['inviter', 'invitation', 'code', 'rejoindre', 'membre', 'famille'],
    },
    {
      id: 'commun-et-perso',
      title: 'Espace commun et espace perso',
      blocks: [
        {
          type: 'list',
          items: [
            'Le commun sert aux dépenses partagées (loyer, courses, enfants…). Il est visible par tout le foyer.',
            'Le perso est rien qu’à vous. Personne d’autre dans le foyer ne le voit.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Le sélecteur « Commun / Perso » en haut de l’écran indique toujours dans quel espace vous êtes. Chaque espace a son propre plan, ses opérations, ses comptes, ses projets et ses crédits.',
        },
        {
          type: 'paragraph',
          text: 'La page Foyer et les démarches de vie concernent tout le foyer, quel que soit l’espace choisi.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’accueil', to: '/' }],
      keywords: ['privé', 'partagé', 'perso', 'commun', 'espace'],
    },
    {
      id: 'les-4-blocs',
      title: 'Les 4 blocs : Fixe, Courant, Plaisir, Épargne',
      blocks: [
        { type: 'paragraph', text: 'Chaque dépense est rangée dans un bloc. L’idée est de donner une place à chaque euro, y compris au plaisir.' },
        {
          type: 'list',
          items: [
            'Fixe : ce qui tombe chaque mois (loyer, assurances, abonnements).',
            'Courant : la vie de tous les jours (courses, transports, santé).',
            'Plaisir : sorties, loisirs, cadeaux, tout ce qui fait du bien.',
            'Épargne : ce que l’on met de côté pour plus tard.',
          ],
        },
      ],
      keywords: ['bloc', 'fixe', 'courant', 'plaisir', 'épargne', 'catégorie'],
    },
    {
      id: 'le-plan',
      title: 'Le plan : le budget d’un mois type',
      blocks: [
        {
          type: 'paragraph',
          text: 'Le plan indique ce que vous prévoyez chaque mois : vos revenus et un montant pour chacun des 4 blocs. L’accueil le compare ensuite à ce qui s’est vraiment passé (« prévu » et « réel »).',
        },
        {
          type: 'paragraph',
          text: 'Si le plan dépasse les revenus prévus, l’écran vous le signale. Dans l’espace commun, le total des 4 blocs sert de base au calcul de la part de chacun.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le plan', to: '/plan' }],
      keywords: ['budget', 'prévu', 'réel', 'revenus prévus'],
    },
    {
      id: 'saisir-une-operation',
      title: 'Saisir une opération',
      blocks: [
        {
          type: 'list',
          ordered: true,
          items: [
            'Sur l’accueil, appuyez sur le bouton « + » (Ajouter une opération).',
            'Choisissez Dépense ou Revenu, puis saisissez le montant.',
            'Choisissez le bloc, donnez un libellé et vérifiez la date.',
            'Si vous avez des comptes bancaires dans l’application, choisissez le compte concerné.',
            'Enregistrez.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Pour corriger ou supprimer une opération, utilisez la liste « Opérations » de l’accueil. Pour voir un autre mois, utilisez le sélecteur de mois en haut de l’accueil.',
        },
        {
          type: 'paragraph',
          text: 'Sans réseau, l’opération est gardée sur votre téléphone et part toute seule dès que la connexion revient.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’accueil', to: '/' }],
      keywords: ['dépense', 'revenu', 'ajouter', 'noter', 'saisie'],
    },
  ],
};
