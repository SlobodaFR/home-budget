import { APP_NAME, APP_VERSION, REPOSITORY_URL } from '../../domain/app-info';
import { HelpLink, HelpSection } from '../../domain/help';

const repositoryLinks: HelpLink[] = REPOSITORY_URL ? [{ kind: 'external', label: 'Voir le projet sur GitHub', href: REPOSITORY_URL }] : [];

export const aPropos: HelpSection = {
  id: 'a-propos',
  kind: 'about',
  title: 'À propos',
  summary: 'La version de l’application et où trouver le projet.',
  keywords: ['version', 'github', 'code source', 'dépôt'],
  entries: [
    {
      id: 'a-propos-version',
      title: APP_NAME,
      blocks: [
        { type: 'paragraph', text: `Version ${APP_VERSION}.` },
        {
          type: 'paragraph',
          text: 'Une application de budget pour la famille : un espace commun, un espace perso pour chacun, et la documentation que vous lisez en ce moment, incluse dans l’application.',
        },
      ],
      links: repositoryLinks,
      keywords: ['version', 'numéro de version', 'github', 'dépôt'],
    },
  ],
};
