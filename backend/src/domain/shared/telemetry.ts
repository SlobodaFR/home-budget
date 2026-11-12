/**
 * Télémétrie produit anonyme (PostHog). Tout ce qui est listé ici sort du système : jamais de
 * donnée personnelle (libellé, montant, nom de foyer, e-mail, identifiant brut, nom de fichier).
 * Le membre n'est identifié que par un pseudonyme calculé par l'adaptateur.
 */
export type TelemetryEvent =
  | { name: 'household_created'; properties: Record<string, never> }
  | { name: 'statement_imported'; properties: { rows: number } }
  | {
      name: 'data_exported';
      properties: { format: 'json' } | { format: 'csv' };
    }
  | {
      name: 'debt_extraction_finished';
      properties: {
        outcome: 'done' | 'failed';
        /** Origine du texte (couche texte ou OCR), jamais son contenu. */
        source?: string;
        fields?: number;
      };
    }
  | {
      name: 'http_request';
      properties: {
        route: string;
        method: string;
        status: number;
        duration_ms: number;
      };
    };

/**
 * Port (driven side), « fire and forget » : synchrone, ne lève jamais d'erreur vers l'appelant.
 * `userId` est le membre tel que connu de l'app : l'adaptateur le pseudonymise. Sans lui,
 * l'événement est anonyme.
 */
export abstract class Telemetry {
  abstract capture(event: TelemetryEvent, userId?: string): void;
}

/** Implémentation neutre : ne fait rien (tests, valeur par défaut). */
export class NoTelemetry extends Telemetry {
  capture(): void {
    // volontairement vide
  }
}
