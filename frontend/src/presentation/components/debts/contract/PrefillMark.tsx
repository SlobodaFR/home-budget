import { ExtractionConfidence, PREFILL_MARK_TEXT, PREFILL_MARK_UNSURE_TEXT } from '../../../../domain/debt-extraction';
import { InfoIcon } from '../../Icons';

/** Le repère « Prérempli depuis le contrat : à vérifier », qui disparaît dès que la personne modifie le champ. */
export function PrefillMark({ confidence }: { confidence?: ExtractionConfidence }) {
  if (!confidence) {
    return null;
  }
  return (
    <p data-testid="prefill-mark" className="mt-1 inline-flex items-start gap-1 rounded border border-plaisir/50 bg-plaisir/10 px-sm py-1 font-body-sm text-body-sm text-ink">
      <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
      {confidence === 'HIGH' ? PREFILL_MARK_TEXT : PREFILL_MARK_UNSURE_TEXT}
    </p>
  );
}
