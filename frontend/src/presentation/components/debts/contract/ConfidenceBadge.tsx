import { CONFIDENCE_LABEL, ExtractionConfidence } from '../../../../domain/debt-extraction';
import { AlertIcon, CheckIcon, InfoIcon } from '../../Icons';

const STYLE: Record<ExtractionConfidence, { className: string; Icon: typeof CheckIcon }> = {
  HIGH: { className: 'border-success/40 bg-success/10 text-success', Icon: CheckIcon },
  MEDIUM: { className: 'border-plaisir/60 bg-plaisir/10 text-ink', Icon: InfoIcon },
  LOW: { className: 'border-error/40 bg-error/5 text-error', Icon: AlertIcon },
};

/** La confiance d'une valeur lue, en TEXTE et en icône (jamais par la seule couleur). */
export function ConfidenceBadge({ confidence, id }: { confidence: ExtractionConfidence; id?: string }) {
  const { className, Icon } = STYLE[confidence];
  return (
    <span id={id} data-confidence={confidence} className={`inline-flex min-h-[28px] items-center gap-1 rounded-full border px-sm font-body-sm text-body-sm font-semibold ${className}`}>
      <Icon width={16} height={16} className="shrink-0" />
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}
