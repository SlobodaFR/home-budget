import { HelpSection } from '../../domain/help';

export const faq: HelpSection = {
  id: 'faq',
  kind: 'faq',
  title: 'Questions fréquentes',
  summary: 'Les questions que l’on se pose le plus souvent, avec des réponses courtes.',
  keywords: ['faq', 'question', 'problème', 'pourquoi', 'comment'],
  entries: [
    {
      id: 'faq-solde-negatif',
      title: 'Pourquoi mon solde de fin de mois est-il négatif ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Le solde projeté ne compte que ce que l’application connaît : vos revenus déjà enregistrés (plus les revenus récurrents à venir), moins vos dépenses déjà faites et les paiements récurrents encore attendus. Trois causes sont fréquentes :',
        },
        {
          type: 'list',
          items: [
            'Votre salaire n’est pas encore noté : ajoutez-le comme revenu, ou comme paiement récurrent de type revenu pour qu’il soit prévu chaque mois.',
            'Des paiements ont eu lieu mais ne sont pas encore importés ou saisis : ils apparaissent « Non retrouvé » dans le prévisionnel.',
            'Les dépenses sont vraiment plus hautes que les revenus de ce mois.',
          ],
        },
        {
          type: 'paragraph',
          text: 'Le solde prudent est volontairement plus bas : il suppose que vous dépensez au moins le prévu dans chaque bloc. Ce n’est pas une prédiction, seulement une façon de se garder une marge.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le prévisionnel', to: '/previsionnel' }],
      keywords: ['solde', 'négatif', 'rouge', 'projeté', 'prudent'],
    },
    {
      id: 'faq-commun-zero-revenu',
      title: 'Pourquoi le commun a 0 € de revenus ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'L’espace commun n’a pas de salaire : il est financé par la contribution de chacun. Ses revenus apparaissent quand quelqu’un appuie sur « J’ai versé ma contribution » dans la page Foyer, ce qui ajoute un revenu « Contribution de … ».',
        },
        {
          type: 'paragraph',
          text: 'Dans le prévisionnel, tant que le plan commun n’a pas de revenus prévus, l’application suppose que chacun versera sa part (le message « Les contributions de chacun sont supposées versées » le rappelle). Cela évite d’afficher un solde négatif à tort.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['commun', 'revenus', 'zéro', 'contribution'],
    },
    {
      id: 'faq-contribution-obligatoire',
      title: 'Ma contribution est-elle obligatoire ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Non, l’application ne force rien et ne prélève rien : c’est un outil de suivi. La règle (moitié-moitié, au prorata des revenus, même reste pour chacun) se choisit dans la page Foyer et vaut pour tout le foyer ; le montant affiché est ce qui est attendu d’après cette règle. À vous de vous mettre d’accord entre vous.',
        },
        {
          type: 'paragraph',
          text: 'Quand vous avez versé votre part, vous la notez pour que chacun voie où on en est. Si un revenu n’est pas renseigné, certaines règles ne peuvent pas être calculées : l’écran affiche alors « À calculer ».',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['contribution', 'obligatoire', 'règle', 'part'],
    },
    {
      id: 'faq-perso-visible',
      title: 'Les autres membres voient-ils mes dépenses perso ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Non. L’espace perso n’est visible que de vous : pour les autres membres, il n’existe pas. Ils voient seulement ce qui concerne le commun, par exemple le revenu « Contribution de … » que vous y ajoutez, et votre revenu net mensuel renseigné dans la page Foyer.',
        },
      ],
      keywords: ['perso', 'privé', 'voir', 'confidentialité', 'conjoint'],
    },
    {
      id: 'faq-hebergeur',
      title: 'L’hébergeur peut-il lire mon espace perso ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Techniquement, oui. Vos données perso sont chiffrées, mais la clé de chiffrement est détenue par l’hébergeur de l’application. Le chiffrement protège contre la fuite de la base de données et contre la curiosité des autres membres du foyer, pas contre l’hébergeur lui-même.',
        },
        { type: 'paragraph', text: 'Une clé propre à chaque personne est une idée pour la suite.' },
      ],
      keywords: ['chiffrement', 'clé', 'hébergeur', 'sécurité'],
    },
    {
      id: 'faq-supprimer-donnees',
      title: 'Puis-je supprimer mes données ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Élément par élément, oui : opérations, paiements récurrents, projets, crédits, démarches de vie ; un compte bancaire est supprimé s’il ne sert à rien, sinon archivé. En revanche, il n’y a pas encore de bouton pour supprimer tout votre compte ou quitter un foyer : il faut pour cela demander à la personne qui héberge l’application. Vous pouvez d’abord télécharger une copie dans Foyer, « Mes données ».',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['supprimer', 'effacer', 'quitter', 'compte', 'rgpd'],
    },
    {
      id: 'faq-sans-reseau',
      title: 'Puis-je saisir une dépense sans réseau ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Oui, depuis l’accueil. L’opération est gardée sur votre téléphone, un bandeau indique combien sont en attente, et elles partent toutes seules quand la connexion revient. Les autres actions (import, modifications, page Foyer…) demandent une connexion.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’accueil', to: '/' }],
      keywords: ['hors ligne', 'réseau', 'offline', 'saisie'],
    },
    {
      id: 'faq-doublons-import',
      title: 'J’ai importé deux fois le même relevé : y aura-t-il des doublons ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'L’application repère les lignes déjà importées et les range à part, sous « Déjà importées », ignorées par défaut. Vous voyez le tri avant de valider : rien n’est enregistré tant que vous n’avez pas validé.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir l’import de relevé', to: '/import' }],
      keywords: ['import', 'doublon', 'relevé', 'deux fois'],
    },
    {
      id: 'faq-changer-revenu',
      title: 'Comment changer mon revenu net mensuel ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Dans la page Foyer, rubrique « Mon revenu net mensuel ». Les parts de chacun dans le commun sont recalculées avec la nouvelle valeur.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['revenu', 'salaire', 'modifier'],
    },
    {
      id: 'faq-code-invitation',
      title: 'Mon code d’invitation ne marche pas',
      blocks: [
        {
          type: 'paragraph',
          text: 'Un code est valable 7 jours et ne sert qu’une fois. S’il est inconnu, expiré ou déjà utilisé, demandez-en un nouveau à la personne du foyer, depuis sa page Foyer. Un foyer compte 4 personnes au plus, et on ne peut appartenir qu’à un seul foyer.',
        },
      ],
      keywords: ['invitation', 'code', 'rejoindre', 'foyer complet'],
    },
    {
      id: 'faq-credit-garanti',
      title: 'Le crédit d’impôt affiché est-il garanti ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'Non, c’est une estimation calculée à partir de vos paiements récurrents et des plafonds publiés à la date de vérification indiquée. En cas de doute, consultez la source officielle ou votre centre des impôts.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir les aides', to: '/aides' }],
      keywords: ['crédit d’impôt', 'estimation', 'garanti', 'aides'],
    },
    {
      id: 'faq-lecon-du-cours',
      title: 'Que veut dire « Leçon 3 du cours » dans un conseil ?',
      blocks: [
        {
          type: 'paragraph',
          text: 'L’application s’appuie sur un cours de finances familiales, et certains conseils indiquent la leçon correspondante. Le cours n’est pas hébergé dans l’application : il n’y a donc pas de lien, seulement le numéro de la leçon.',
        },
      ],
      keywords: ['cours', 'leçon', 'conseil'],
    },
  ],
};
