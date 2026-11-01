import { Debt, describePaymentCheck } from '../../../domain/debt';
import { AlertIcon, CheckIcon, InfoIcon } from '../Icons';

/**
 * Cohérence entre la mensualité saisie et le prêt d'origine. Un écart est écrit en toutes lettres (jamais la couleur seule)
 * et invite à revérifier la saisie ou la durée, sans conseil de renégociation ni de rachat. Le reste est discret.
 * `compact` : sur la carte, seul l'écart s'affiche.
 */
export function PaymentCheckNotice({ debt, compact = false }: { debt: Debt; compact?: boolean }) {
  const message = describePaymentCheck(debt);
  if (message.level === 'gap') {
    return (
      <div
        role="note"
        aria-label="Écart de mensualité"
        data-testid="payment-gap"
        className="flex items-start gap-sm rounded border border-plaisir/60 bg-plaisir/10 p-md font-body-sm text-body-sm text-ink"
      >
        <AlertIcon width={20} height={20} className="mt-0.5 shrink-0" />
        <span>
          <span className="block font-semibold">Mensualité à vérifier</span>
          <span className="block">{message.text}</span>
        </span>
      </div>
    );
  }
  if (compact) {
    return null;
  }
  const Icon = message.level === 'ok' ? CheckIcon : InfoIcon;
  return (
    <p data-testid={message.level === 'ok' ? 'payment-ok' : 'payment-unknown'} className="flex items-start gap-sm font-body-sm text-body-sm text-mute">
      <Icon width={16} height={16} className="mt-0.5 shrink-0" />
      {message.text}
    </p>
  );
}
