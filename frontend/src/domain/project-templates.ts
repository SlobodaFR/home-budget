import { addMonths } from './month';
import { ProjectFormValues, ProjectKind } from './project';

export interface ProjectTemplate {
  id: string;
  label: string;
  kind: ProjectKind;
  /** Nom proposé, que l'on peut changer. Vide : on laisse le champ libre. */
  name: string;
  /** Horizon raisonnable en mois ; aucun montant n'est imposé. */
  horizonMonths: number;
  hint: string;
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  { id: 'baby', label: 'Naissance', kind: 'BABY', name: 'Arrivée du bébé', horizonMonths: 9, hint: 'Poussette, lit, premiers mois : environ 9 mois devant vous.' },
  { id: 'holiday', label: 'Vacances', kind: 'HOLIDAY', name: 'Vacances', horizonMonths: 8, hint: 'Un départ à prévoir sans piocher dans le quotidien.' },
  { id: 'car', label: 'Voiture', kind: 'PURCHASE', name: 'Voiture', horizonMonths: 18, hint: 'Achat ou remplacement : on vise plutôt 18 mois.' },
  { id: 'works', label: 'Travaux', kind: 'HOME', name: 'Travaux', horizonMonths: 12, hint: 'Rénovation, équipement de la maison : un an pour s’y préparer.' },
  { id: 'other', label: 'Autre', kind: 'OTHER', name: '', horizonMonths: 12, hint: 'Un autre objectif : vous choisissez tout.' },
];

/** Préremplit nom, type et échéance (départ + horizon) ; ne touche ni au montant, ni à l'épargne de départ, ni au compte. */
export function applyTemplate(values: ProjectFormValues, template: ProjectTemplate): ProjectFormValues {
  return {
    ...values,
    kind: template.kind,
    name: template.name,
    targetDate: addMonths(values.startDate, template.horizonMonths),
  };
}
