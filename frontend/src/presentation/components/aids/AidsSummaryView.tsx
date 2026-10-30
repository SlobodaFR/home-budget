import { AidRuleSummary, AidsSummary, capStatus, describeCapStatus, describeRate, monthlySaving } from '../../../domain/aids';
import { formatCents } from '../../../domain/money';
import { cardClass } from '../ui';
import { SourceLink } from './SourceLink';

function RuleCard({ rule }: { rule: AidRuleSummary }) {
  const status = capStatus(rule);
  return (
    <li className="py-md first:pt-0 last:pb-0">
      <h4 className="font-body-md text-body-md font-semibold">{rule.label}</h4>
      <p className="font-body-sm text-body-sm text-mute">{describeRate(rule.ratePercent)}</p>

      <dl className="mt-md grid grid-cols-3 gap-md">
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Dépensé</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(rule.spentCents)}</dd>
        </div>
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Plafond</dt>
          <dd className="tabular font-body-md text-body-md font-semibold">{formatCents(rule.capCents)}</dd>
        </div>
        <div>
          <dt className="font-body-sm text-body-sm text-mute">Crédit attendu</dt>
          <dd className="tabular font-body-md text-body-md font-bold text-success">{formatCents(rule.expectedCreditCents)}</dd>
        </div>
      </dl>

      <div
        role="img"
        aria-label={`${Math.round(status.ratio * 100)} % du plafond utilisé`}
        className="mt-md h-3 overflow-hidden rounded-full bg-soft-cloud"
      >
        <div className={`h-full ${status.reached ? 'bg-plaisir' : 'bg-success'}`} style={{ width: `${status.ratio * 100}%` }} />
      </div>
      <p className={`mt-1 font-body-sm text-body-sm ${status.reached ? 'font-semibold text-plaisir' : 'text-mute'}`}>
        {describeCapStatus(rule)}
      </p>

      {rule.lines.length > 0 && (
        <div className="mt-md">
          <h5 className="font-label-caps text-label-caps uppercase text-mute">Coût net par mois</h5>
          <ul className="mt-sm divide-y divide-hairline-soft rounded bg-soft-cloud px-md">
            {rule.lines.map((line) => (
              <li key={line.recurringId} className="py-sm">
                <p className="font-body-sm text-body-sm font-semibold">{line.label}</p>
                <p className="tabular font-body-sm text-body-sm">
                  {formatCents(line.monthlyCents)} par mois, soit{' '}
                  <span className="font-semibold">{formatCents(line.netMonthlyCents)}</span> une fois l’aide reçue
                </p>
                {monthlySaving(line) > 0 && (
                  <p className="tabular font-body-sm text-body-sm text-success">{formatCents(monthlySaving(line))} récupérés chaque mois en moyenne</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-md font-body-sm text-body-sm">
        <span className="font-semibold">Quand l’argent revient :</span> {rule.cashTiming}
      </p>
      <SourceLink url={rule.sourceUrl} verifiedOn={rule.verifiedOn} />
    </li>
  );
}

export function AidsSummaryView({ summary }: { summary: AidsSummary }) {
  return (
    <section aria-label={`Aides ${summary.year}`} className={`${cardClass} flex flex-col gap-md`}>
      {summary.rules.length === 0 ? (
        <p className="font-body-sm text-body-sm">
          Aucune dépense n’est rattachée à une aide pour {summary.year}. Dans le prévisionnel, ouvrez un paiement récurrent de l’espace commun et choisissez
          une « Aide officielle ».
        </p>
      ) : (
        <>
          <div>
            <p className="font-label-caps text-label-caps uppercase text-mute">Crédit d’impôt attendu en {summary.year}</p>
            <p className="tabular font-heading-xl text-heading-xl text-success">{formatCents(summary.totalExpectedCreditCents)}</p>
          </div>
          <ul className="divide-y divide-hairline-soft border-t border-hairline-soft pt-md">
            {summary.rules.map((rule) => (
              <RuleCard key={rule.ruleId} rule={rule} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
