import { HelpSection } from '../../domain/help';

export const donneesConfidentialite: HelpSection = {
  id: 'donnees-confidentialite',
  kind: 'guide',
  title: 'Mes données et ma confidentialité',
  summary: 'Qui voit quoi, le chiffrement de l’espace perso et sa limite, l’export de vos données, le fonctionnement hors ligne.',
  keywords: ['vie privée', 'sécurité', 'rgpd', 'données personnelles'],
  entries: [
    {
      id: 'qui-voit-quoi',
      title: 'Qui voit quoi ?',
      blocks: [
        {
          type: 'list',
          items: [
            'L’espace commun est visible par tous les membres du foyer : opérations, plan, comptes, projets, crédits, revue du mois.',
            'L’espace perso n’est visible que par son propriétaire. Pour les autres membres, il n’existe tout simplement pas : ils ne le voient ni à l’écran, ni dans leurs exports.',
            'Ce que vous versez au commun est visible de tous (le revenu « Contribution de … » dans le commun), mais pas la dépense correspondante dans votre espace perso.',
            'Votre revenu net mensuel, indiqué dans la page Foyer, est visible des membres du foyer, car il sert à calculer les parts.',
            'Les notes que l’on ajoute aux démarches de vie sont vues par toute la famille.',
          ],
        },
      ],
      keywords: ['visible', 'privé', 'partagé', 'perso', 'commun', 'confidentiel'],
    },
    {
      id: 'chiffrement-de-lespace-perso',
      title: 'Le chiffrement de l’espace perso, et sa limite',
      blocks: [
        {
          type: 'paragraph',
          text: 'Dans votre espace perso, les libellés, les noms et les montants (vos opérations, votre plan, vos comptes, vos projets, vos crédits, vos paiements récurrents, vos revues) sont chiffrés quand ils sont enregistrés : dans la base de données, ils apparaissent sous une forme illisible.',
        },
        {
          type: 'note',
          text: 'La limite, dite honnêtement : la clé de chiffrement est détenue par l’hébergeur de l’application. Il pourrait donc, techniquement, déchiffrer ces données. Le chiffrement protège contre la fuite ou la copie de la base de données seule, et garantit que les autres membres du foyer ne voient rien. Il ne cache pas vos données à l’hébergeur.',
        },
        {
          type: 'paragraph',
          text: 'Une clé propre à chaque personne, que même l’hébergeur ne détiendrait pas, fait partie des idées pour la suite.',
        },
      ],
      keywords: ['chiffrement', 'clé', 'hébergeur', 'sécurité', 'aes', 'cryptage', 'confidentialité'],
    },
    {
      id: 'exporter-mes-donnees',
      title: 'Exporter mes données',
      blocks: [
        { type: 'paragraph', text: 'Vos données vous appartiennent : vous pouvez en garder une copie quand vous voulez, depuis la page Foyer, rubrique « Mes données ».' },
        {
          type: 'list',
          items: [
            'La sauvegarde (JSON) contient tout ce à quoi vous avez accès : le foyer, l’espace commun et votre propre espace perso. L’espace perso d’un autre membre n’en fait jamais partie.',
            'L’export des opérations (CSV) donne un tableau à ouvrir dans Excel ou Numbers : date, type, bloc, libellé, montant et compte de chaque opération. Vous choisissez l’espace et la période (366 jours au plus).',
          ],
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['export', 'sauvegarde', 'json', 'csv', 'télécharger', 'excel', 'copie'],
    },
    {
      id: 'hors-ligne-et-synchronisation',
      title: 'Hors ligne et synchronisation',
      blocks: [
        {
          type: 'list',
          items: [
            'Cette aide est incluse dans l’application : vous pouvez la lire sans réseau.',
            'Sans réseau, vous pouvez toujours ajouter une dépense ou un revenu depuis l’accueil. L’opération est gardée sur cet appareil, un bandeau indique combien sont en attente, et elles partent toutes seules au retour de la connexion.',
            'Si le serveur refuse une opération en attente, un message vous le dit : il faudra la saisir à nouveau.',
            'Tout le reste (chiffres du mois, modifications, import, foyer, versements, démarches cochées) demande une connexion. L’application vous le dit quand c’est le cas.',
          ],
        },
        { type: 'note', text: 'Les opérations en attente restent sur l’appareil où vous les avez saisies jusqu’à leur envoi.' },
      ],
      keywords: ['hors ligne', 'offline', 'réseau', 'synchronisation', 'connexion', 'pwa', 'installer'],
    },
    {
      id: 'supprimer-mes-donnees',
      title: 'Supprimer mes données',
      blocks: [
        {
          type: 'paragraph',
          text: 'Vous pouvez supprimer élément par élément : opérations, paiements récurrents, projets, crédits et démarches de vie. Un compte bancaire qui ne sert à rien peut être supprimé ; s’il est déjà utilisé, il faut l’archiver (son historique est conservé).',
        },
        {
          type: 'paragraph',
          text: 'Il n’existe pas encore de bouton pour supprimer tout votre compte ou quitter un foyer. Pour cela, adressez-vous à la personne qui héberge l’application. Vous pouvez d’abord télécharger une copie de vos données.',
        },
      ],
      links: [{ kind: 'internal', label: 'Ouvrir le foyer', to: '/foyer' }],
      keywords: ['supprimer', 'effacer', 'quitter', 'compte', 'rgpd'],
    },
  ],
};
