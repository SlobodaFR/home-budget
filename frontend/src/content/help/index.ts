import { HelpSection } from '../../domain/help';
import { aPropos } from './a-propos';
import { aVenir } from './a-venir';
import { aidesDemarches } from './aides-demarches';
import { donneesConfidentialite } from './donnees-confidentialite';
import { epargneProjets } from './epargne-projets';
import { faq } from './faq';
import { pourCommencer } from './pour-commencer';
import { reglesSources } from './regles-sources';
import { suiviQuotidien } from './suivi-quotidien';

/** Les sections de l'aide, dans l'ordre du sommaire. */
export const HELP_SECTIONS: readonly HelpSection[] = [
  pourCommencer,
  suiviQuotidien,
  epargneProjets,
  aidesDemarches,
  donneesConfidentialite,
  reglesSources,
  aVenir,
  faq,
  aPropos,
];
