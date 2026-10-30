import { HelpSection, HELP_SOURCES_DISCLAIMER, HELP_SOURCES_SECTION_ID } from '../../domain/help';

const REFERENCES_GROUP = 'Repères et barèmes';

/**
 * Les règles « statiques » : celles qui ne viennent pas du serveur. Les crédits d’impôt et les démarches de naissance sont
 * ajoutés au-dessus, depuis l’API, avec leur source et leur date de vérification.
 * Le barème des crèches est à reconfirmer chaque année ; à la mise à jour, changer aussi `verifiedOn`.
 */
export const reglesSources: HelpSection = {
  id: HELP_SOURCES_SECTION_ID,
  kind: 'sources',
  title: 'Règles officielles et sources',
  summary: 'Les règles utilisées par l’application, ce qu’elles font, leur source officielle et la date à laquelle elles ont été vérifiées.',
  keywords: ['plafond', 'taux', 'barème', 'source', 'officiel', 'vérifié'],
  disclaimer: HELP_SOURCES_DISCLAIMER,
  entries: [
    {
      id: 'repere-endettement-35',
      title: 'Seuil d’endettement de 35 %',
      group: REFERENCES_GROUP,
      blocks: [
        {
          type: 'paragraph',
          text: 'Ce que ça fait : la page Crédits compare vos mensualités (assurances comprises) à vos revenus mensuels et vous montre où vous vous situez par rapport à 35 %.',
        },
        {
          type: 'note',
          text: 'C’est un repère pédagogique courant, pas une règle de droit : l’application ne l’impose à personne, et votre banque peut raisonner autrement.',
        },
      ],
      keywords: ['dette', 'endettement', 'crédit', 'taux d’endettement', 'mensualités'],
      source: { label: 'Repère du cours de finances familiales (pas une source officielle)', url: null, verifiedOn: null },
    },
    {
      id: 'bareme-creche-psu',
      title: 'Participation des crèches (barème de la Caf)',
      group: REFERENCES_GROUP,
      blocks: [
        {
          type: 'paragraph',
          text: 'Ce que ça fait : l’estimateur de crèche calcule un tarif horaire en multipliant vos ressources mensuelles par un taux d’effort qui baisse avec le nombre d’enfants, puis multiplie par les heures facturées.',
        },
        {
          type: 'list',
          items: [
            'Taux d’effort par heure facturée : 0,0619 % pour 1 enfant, 0,0516 % pour 2, 0,0413 % pour 3, 0,0310 % de 4 à 7 et 0,0206 % à partir de 8.',
            'Ressources mensuelles retenues : au moins 814,62 € (plancher) et au plus 8 500 € (plafond).',
          ],
        },
        {
          type: 'note',
          text: 'À confirmer chaque année : le plancher et le plafond changent, et une crèche peut appliquer un plafond plus élevé. Votre crèche reste seule à fixer le tarif exact.',
        },
      ],
      keywords: ['crèche', 'psu', 'caf', 'tarif', 'taux d’effort', 'plancher', 'plafond', 'ressources'],
      source: {
        label: 'caf.fr, guide de la prestation de service unique (PSU) 2026',
        url: 'https://www.caf.fr/sites/default/files/medias/493/Partenaires/Petite-enfance/EAJE/Guide_PSU_2026_02_V_Def.pdf',
        verifiedOn: '2026-10-30',
      },
    },
  ],
};
