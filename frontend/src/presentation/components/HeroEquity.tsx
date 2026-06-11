import { formatCents } from '../../domain/money';

interface HeroEquityProps {
  totalBalanceCents: number;
  onAddTransaction: () => void;
}

export function HeroEquity({ totalBalanceCents, onAddTransaction }: HeroEquityProps) {
  return (
    <section className="hero-gradient px-margin-mobile md:px-margin-desktop py-section flex flex-col items-center justify-center text-center">
      <h2 className="font-label-caps text-label-caps text-mute mb-md uppercase">Solde Total</h2>
      <h1 className="font-display-campaign text-display-campaign-mobile md:text-display-campaign text-ink leading-none">
        {formatCents(totalBalanceCents)}
      </h1>
      <div className="mt-xl flex flex-wrap justify-center gap-md">
        <button
          type="button"
          onClick={onAddTransaction}
          className="bg-ink text-surface px-xl py-md rounded-full font-button-md active:scale-95 transition-transform duration-150 flex items-center gap-sm"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          Ajouter une transaction
        </button>
      </div>
    </section>
  );
}
