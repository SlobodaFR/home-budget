/**
 * Port (driven side). Source unique de « maintenant » : le prévisionnel, les
 * conseils et l'épargne de sécurité en dépendent, et les tests la remplacent
 * par une horloge fixe.
 */
export abstract class Clock {
  abstract now(): Date;
}
