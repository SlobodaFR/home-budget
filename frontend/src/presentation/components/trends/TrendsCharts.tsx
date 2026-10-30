import { formatCentsShort } from '../../../domain/money';
import {
  barPercent,
  describeBalanceChart,
  describeBalanceOfMonth,
  describeIncomeExpenseChart,
  longMonthLabel,
  maxAbsBalance,
  maxIncomeExpense,
  shortMonthLabel,
  TrendMonth,
} from '../../../domain/trends';
import { cardClass } from '../ui';

/** Hachures : la barre « dépenses » (ou un solde négatif) se distingue de la barre pleine sans dépendre de la couleur. */
const HATCH = 'repeating-linear-gradient(45deg, #ffffff 0, #ffffff 3px, currentColor 3px, currentColor 5px)';

function Legend({ items }: { items: { label: string; swatch: 'solid' | 'hatch'; className: string }[] }) {
  return (
    <ul className="mt-sm flex flex-wrap gap-x-lg gap-y-1 font-body-sm text-body-sm">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className={`inline-block h-3 w-5 rounded-sm border-2 border-current ${item.className}`}
            style={item.swatch === 'hatch' ? { backgroundImage: HATCH } : { backgroundColor: 'currentColor' }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function MonthLabels({ months }: { months: readonly TrendMonth[] }) {
  return (
    <div className="mt-1 flex gap-1" aria-hidden="true">
      {months.map((month) => (
        <span key={month.month} className="min-w-0 flex-1 text-center font-body-sm text-[11px] leading-tight text-mute">
          {shortMonthLabel(month.month)}
        </span>
      ))}
    </div>
  );
}

/** Revenus (barre pleine) et dépenses (barre hachurée) de chaque mois. Le texte alternatif donne tous les chiffres. */
export function IncomeExpenseChart({ months }: { months: readonly TrendMonth[] }) {
  const max = maxIncomeExpense(months);
  return (
    <figure className="m-0">
      <div role="img" aria-label={describeIncomeExpenseChart(months)} data-testid="income-expense-chart">
        <div className="flex h-[140px] items-end gap-1 border-b border-hairline" aria-hidden="true">
          {months.map((month) => (
            <div key={month.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]">
              <span className="block w-1/2 max-w-[14px] rounded-t-sm bg-ink" style={{ height: `${barPercent(month.incomeCents, max)}%` }} data-testid="income-bar" />
              <span
                className="block w-1/2 max-w-[14px] rounded-t-sm border-2 border-b-0 border-ink text-ink"
                style={{ height: `${barPercent(month.expenseCents, max)}%`, backgroundImage: HATCH }}
                data-testid="expense-bar"
              />
            </div>
          ))}
        </div>
        <MonthLabels months={months} />
      </div>
      <Legend
        items={[
          { label: 'Revenus (barre pleine)', swatch: 'solid', className: 'text-ink' },
          { label: 'Dépenses (barre hachurée)', swatch: 'hatch', className: 'text-ink' },
        ]}
      />
    </figure>
  );
}

/** Solde de chaque mois : barre pleine vers le haut s'il est positif, barre hachurée vers le bas s'il est négatif. */
export function BalanceChart({ months }: { months: readonly TrendMonth[] }) {
  const max = maxAbsBalance(months);
  return (
    <figure className="m-0">
      <div role="img" aria-label={describeBalanceChart(months)} data-testid="balance-chart">
        <div className="flex gap-1" aria-hidden="true">
          {months.map((month) => {
            const height = barPercent(Math.abs(month.balanceCents), max);
            const positive = month.balanceCents > 0;
            const negative = month.balanceCents < 0;
            return (
              <div key={month.month} className="flex min-w-0 flex-1 flex-col items-center">
                <div className="flex h-[60px] w-full items-end justify-center">
                  {positive && <span className="block w-1/2 max-w-[14px] rounded-t-sm bg-success" style={{ height: `${height}%` }} data-testid="balance-bar-positive" />}
                </div>
                <div className="h-px w-full bg-ink" />
                <div className="flex h-[60px] w-full items-start justify-center">
                  {negative && (
                    <span
                      className="block w-1/2 max-w-[14px] rounded-b-sm border-2 border-t-0 border-error text-error"
                      style={{ height: `${height}%`, backgroundImage: HATCH }}
                      data-testid="balance-bar-negative"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <MonthLabels months={months} />
      </div>
      <Legend
        items={[
          { label: 'Solde positif (barre pleine, vers le haut)', swatch: 'solid', className: 'text-success' },
          { label: 'Solde négatif (barre hachurée, vers le bas)', swatch: 'hatch', className: 'text-error' },
        ]}
      />
    </figure>
  );
}

/** Les mêmes chiffres en tableau, pour ceux qui préfèrent lire les montants exacts. */
export function TrendsTable({ months }: { months: readonly TrendMonth[] }) {
  return (
    <details className={`group ${cardClass} p-0`}>
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center px-gutter font-body-md text-body-md font-semibold">Voir les chiffres mois par mois</summary>
      <div className="overflow-x-auto px-gutter pb-gutter">
        <table className="w-full min-w-[320px] border-collapse font-body-sm text-body-sm">
          <caption className="sr-only">Revenus, dépenses et solde de chaque mois</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-mute">
              <th scope="col" className="py-1 pr-2 font-semibold">
                Mois
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">
                Revenus
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">
                Dépenses
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Solde
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month} className="border-b border-hairline-soft">
                <th scope="row" className="py-2 pr-2 text-left font-semibold capitalize">
                  {longMonthLabel(month.month)}
                </th>
                <td className="tabular py-2 pr-2 text-right">{formatCentsShort(month.incomeCents)}</td>
                <td className="tabular py-2 pr-2 text-right">{formatCentsShort(month.expenseCents)}</td>
                <td className={`tabular py-2 text-right font-semibold ${month.balanceCents < 0 ? 'text-error' : ''}`}>
                  {month.balanceCents < 0 ? '− ' : ''}
                  {formatCentsShort(Math.abs(month.balanceCents))}
                  <span className="sr-only"> ({describeBalanceOfMonth(month.balanceCents)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
