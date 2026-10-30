import { BLOC_INFO, BLOCS } from '../../../domain/bloc';
import { formatCents } from '../../../domain/money';
import { pluralize } from '../../../domain/plural';
import { ImportTotals } from '../../../domain/statement-import';
import { BLOC_STYLE } from '../bloc-style';
import { cardClass } from '../ui';
import { TARGET_STYLE } from './target-style';

export function ImportTotalsCard({ totals, learnedCount }: { totals: ImportTotals; learnedCount: number }) {
  return (
    <section aria-label="Totaux de l’import" className={`${cardClass} flex flex-col gap-md`}>
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Ce qui sera importé</h3>
      <dl className="grid grid-cols-2 gap-x-xl gap-y-sm">
        {BLOCS.map((bloc) => (
          <div key={bloc} className="flex items-center justify-between gap-sm">
            <dt className="flex items-center gap-sm font-body-sm text-body-sm">
              <span className={`inline-block h-3 w-3 rounded-full ${BLOC_STYLE[bloc].dot}`} aria-hidden="true" />
              {BLOC_INFO[bloc].label}
            </dt>
            <dd className="tabular font-body-sm text-body-sm font-semibold">{formatCents(totals.byBloc[bloc])}</dd>
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between gap-sm border-t border-hairline-soft pt-sm">
          <dt className="flex items-center gap-sm font-body-sm text-body-sm">
            <span className={`inline-block h-3 w-3 rounded-full ${TARGET_STYLE.INCOME.dot}`} aria-hidden="true" />
            Revenus
          </dt>
          <dd className="tabular font-body-sm text-body-sm font-semibold text-success">{formatCents(totals.incomeCents)}</dd>
        </div>
      </dl>
      <p className="font-body-sm text-body-sm text-mute" aria-live="polite">
        {totals.toCreateCount === 0
          ? 'Aucune opération ne sera créée.'
          : `${pluralize(totals.toCreateCount, 'opération sera créée', 'opérations seront créées')}.`}
        {learnedCount > 0 && ` ${pluralize(learnedCount, 'règle retenue', 'règles retenues')}.`}
      </p>
    </section>
  );
}
