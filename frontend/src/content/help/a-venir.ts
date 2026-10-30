import { HelpSection } from '../../domain/help';

export const aVenir: HelpSection = {
  id: 'a-venir',
  kind: 'guide',
  title: 'Ce qui est prévu',
  summary: 'Les idées pour la suite et les limites connues de l’application, dites simplement.',
  keywords: ['feuille de route', 'roadmap', 'futur', 'limites', 'bientôt'],
  entries: [
    {
      id: 'idees-pour-la-suite',
      title: 'Idées pour la suite',
      blocks: [
        { type: 'paragraph', text: 'Ce sont des idées, pas des promesses : rien de tout cela n’existe encore.' },
        {
          type: 'list',
          items: [
            'Virements entre comptes : aujourd’hui, le suivi des contributions couvre le cas commun / perso, mais pas les virements en général.',
            'Un conseil par intelligence artificielle, en option, avec des garde-fous : aucune donnée de votre espace perso envoyée sans votre accord explicite, et aucun conseil de placement. À envisager en dernier : les conseils actuels sont simples et vérifiables.',
            'La lecture de tickets de caisse et de relevés scannés, avec toujours votre validation avant d’enregistrer quoi que ce soit.',
            'Des rappels (démarches à faire, paiements attendus). Cela demande des notifications sur le téléphone, à tester notamment sur iPhone.',
            'D’autres événements de vie : déménagement, achat immobilier, séparation, changement de travail.',
            'Une clé de chiffrement propre à chaque personne pour l’espace perso, que l’hébergeur ne détiendrait pas.',
          ],
        },
      ],
      keywords: ['virement', 'intelligence artificielle', 'ia', 'ticket', 'ocr', 'rappel', 'notification', 'déménagement'],
    },
    {
      id: 'limites-connues',
      title: 'Ce qui n’est pas encore éprouvé',
      blocks: [
        { type: 'paragraph', text: 'L’application est récente. Voici, franchement, ce qui reste à confirmer :' },
        {
          type: 'list',
          items: [
            'La connexion avec votre compte n’a pas encore été éprouvée à grande échelle : les tests automatiques ont surtout utilisé une connexion de démonstration.',
            'L’installation sur l’écran d’accueil et le fonctionnement hors ligne n’ont pas encore été testés sur de vrais iPhone.',
            'Si le réseau coupe au mauvais moment, une opération saisie peut, très rarement, être enregistrée deux fois : jetez un œil à la liste de temps en temps.',
            'Les démarches de naissance supposent une naissance, pas une adoption, et les conditions varient selon les situations.',
            'Les règles officielles (plafonds, barème de crèche, délais) sont revérifiées chaque année : une règle peut avoir changé avant d’être mise à jour. La date de vérification est toujours affichée.',
          ],
        },
        { type: 'paragraph', text: 'Si quelque chose ne se passe pas comme prévu, dites-le à la personne qui s’occupe de l’application : c’est précieux.' },
      ],
      keywords: ['limite', 'bug', 'iphone', 'ios', 'connexion', 'doublon', 'adoption', 'pas encore'],
    },
    {
      id: 'ce-que-lapplication-ne-fait-pas',
      title: 'Ce que l’application ne fait pas',
      blocks: [
        {
          type: 'list',
          items: [
            'Elle ne se connecte pas à votre banque : les opérations viennent de votre saisie ou de l’import d’un relevé.',
            'Elle ne déplace pas d’argent et ne prélève rien.',
            'Elle ne remplace ni un conseiller bancaire, ni un expert-comptable, ni l’administration fiscale.',
            'Elle n’héberge pas le cours de finances familiales dont elle s’inspire.',
          ],
        },
      ],
      keywords: ['banque', 'connexion bancaire', 'cours', 'conseiller'],
    },
  ],
};
