import { HelpSection } from '../../domain/help';

export const suiviQuotidien: HelpSection = {
  id: 'suivi-quotidien',
  kind: 'guide',
  title: 'Le suivi au quotidien',
  summary: 'Importer un relevé, paiements récurrents et prévisionnel, comptes bancaires, contributions au commun, revue mensuelle et tendances.',
  keywords: ['mensuel', 'quotidien', 'suivi'],
  entries: [
    {
      id: 'importer-un-releve',
      title: 'Importer un relevé de banque',
      blocks: [
        {
          type: 'paragraph',
          text: 'Plutôt que de tout saisir à la main, vous pouvez importer le fichier CSV du mois téléchargé sur le site de votre banque.',
        },
        {
          type: 'list',
          ordered: true,
          items: [
            'Choisissez le fichier du relevé. Il est lu sur votre appareil, puis envoyé à votre serveur pour analyse.',
            'L’application propose un bloc pour chaque ligne, d’après des mots-clés du libellé. Elle repère aussi les lignes déjà importées et les ignore par défaut.',
            'Corrigez ce qui doit l’être. Cochez « Retenir pour la prochaine fois » pour que le même libellé soit classé tout seul le mois suivant.',
            'Validez : seules les lignes que vous avez gardées sont enregistrées, et l’enregistrement se fait en une fois (tout ou rien).',
          ],
        },
        { type: 'paragraph', text: 'L’import demande une connexion. Si vous avez des comptes bancaires dans l’application, vous choisissez celui du relevé.' },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’import de relevé', to: '/import' }],
      keywords: ['csv', 'banque', 'fichier', 'doublon', 'règles', 'classement'],
    },
    {
      id: 'recurrents-et-previsionnel',
      title: 'Paiements récurrents et prévisionnel',
      blocks: [
        {
          type: 'paragraph',
          text: 'Un paiement récurrent est une somme qui revient : loyer, abonnement, assurance, mais aussi un salaire. Vous les notez une fois, avec leur rythme (chaque mois, chaque trimestre ou chaque année), dans la page Prévisionnel.',
        },
        {
          type: 'paragraph',
          text: 'Le prévisionnel répond à la question « où en sera le budget à la fin du mois ? ». Il donne deux soldes :',
        },
        {
          type: 'list',
          items: [
            'Le solde projeté : ce que l’on sait déjà, c’est-à-dire vos opérations du mois et les paiements récurrents encore à venir.',
            'Le solde prudent : la même chose, mais en supposant que vous dépensez au moins le prévu dans chaque bloc.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Chaque paiement attendu porte un statut : « Retrouvé » (déjà dans vos opérations), « Non retrouvé » (attendu mais pas encore vu : le relevé n’est peut-être pas encore importé) ou « À venir ».',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le prévisionnel', to: '/previsionnel' }],
      keywords: ['abonnement', 'loyer', 'solde', 'projeté', 'prudent', 'fin de mois', 'récurrent'],
    },
    {
      id: 'comptes-bancaires',
      title: 'Comptes bancaires',
      blocks: [
        {
          type: 'paragraph',
          text: 'Un compte dit où circule l’argent : compte courant, livret ou épargne, espèces. Vous indiquez le solde de départ et sa date ; l’application suit ensuite le solde de chaque compte et projette où il sera à la fin du mois.',
        },
        {
          type: 'paragraph',
          text: 'Archiver un compte le retire de la liste en gardant son historique. Un compte qui ne sert à rien peut être supprimé ; s’il est déjà utilisé par des opérations, des paiements récurrents ou des projets, il faut l’archiver.',
        },
        {
          type: 'paragraph',
          text: 'Les comptes de l’espace commun sont visibles par tout le foyer, ceux de l’espace perso par vous seul.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les comptes', to: '/comptes' }],
      keywords: ['livret', 'solde', 'espèces', 'banque', 'courant'],
    },
    {
      id: 'contributions-au-commun',
      title: 'Les contributions au commun',
      blocks: [
        {
          type: 'paragraph',
          text: 'L’espace commun est financé par la contribution de chacun. Le foyer choisit une règle, dans la page Foyer :',
        },
        {
          type: 'list',
          items: [
            'Moitié-moitié : chacun verse la même somme.',
            'Au prorata des revenus : chacun verse une part proportionnelle à ce qu’il gagne.',
            'Même reste pour chacun : chacun verse ce qu’il faut pour qu’il reste autant à tous une fois le commun financé.',
          ],
        },
        {
          type: 'paragraph',
          text: 'L’« Aperçu des parts » montre combien chacun doit verser. Quand vous avez versé votre part, appuyez sur « J’ai versé ma contribution » : l’application ajoute un revenu « Contribution de … » dans le commun et, si vous le souhaitez, la dépense correspondante dans votre espace perso (visible de vous seul). La carte « Contributions du mois » montre ensuite pour chacun ce qui est attendu, versé et restant.',
        },
        {
          type: 'note',
          text: 'L’application ne déplace pas d’argent et ne prélève rien : elle calcule et garde la trace.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['contribution', 'part', 'prorata', 'moitié', 'verser', 'commun', 'revenu'],
    },
    {
      id: 'revue-mensuelle',
      title: 'La revue mensuelle',
      blocks: [
        {
          type: 'paragraph',
          text: 'Une fois par mois, prenez quelques minutes pour regarder ce qui s’est passé, répondre à trois questions, puis décider une seule chose pour le mois suivant.',
        },
        {
          type: 'list',
          items: ['Qu’est-ce qui a bien marché ?', 'Qu’est-ce qui m’a surpris ?', 'Quelle décision pour le mois prochain ?'],
        },
        { type: 'paragraph', text: 'La revue de votre espace perso est privée : vous seul la voyez.' },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir ma revue du mois', to: '/revue' }],
      keywords: ['bilan', 'point', 'décision', 'mois'],
    },
    {
      id: 'tendances',
      title: 'Les tendances',
      blocks: [
        {
          type: 'paragraph',
          text: 'Sans rien à saisir de plus, la page Tendances montre où va l’argent sur les 3, 6 ou 12 derniers mois : revenus et dépenses, solde de chaque mois et taux d’épargne moyen.',
        },
        {
          type: 'paragraph',
          text: 'Elle signale aussi ce qui grimpe, c’est-à-dire les dépenses qui augmentent. Pour cela, il faut au moins 4 mois d’opérations.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les tendances', to: '/tendances' }],
      keywords: ['évolution', 'graphique', 'taux d’épargne', 'dépenses qui augmentent'],
    },
    {
      id: 'conseils-de-laccueil',
      title: 'Les conseils de l’accueil',
      blocks: [
        {
          type: 'paragraph',
          text: 'En haut de l’accueil, de courts conseils signalent ce qui mérite votre attention : un paiement attendu mais non retrouvé, une contribution à verser, une démarche en retard…',
        },
        {
          type: 'paragraph',
          text: 'Ils sont calculés à partir de vos chiffres avec des règles simples et vérifiables. Il n’y a pas d’intelligence artificielle derrière.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’accueil', to: '/' }],
      keywords: ['alerte', 'conseil', 'prochaines actions'],
    },
  ],
};
