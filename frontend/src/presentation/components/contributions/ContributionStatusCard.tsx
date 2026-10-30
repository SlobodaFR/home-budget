import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { describeError, isOfflineError } from '../../../application/error-message';
import { useContributionStatus } from '../../../application/use-contribution-status';
import { useRequiredHousehold } from '../../../application/use-household';
import {
  CONTRIBUTION_STATUS_LABEL,
  ContributionStatus,
  describeMemberStatus,
  describePayment,
  describeProgress,
  describeTotals,
  INCOMPLETE_MESSAGE,
  maxContributionMonth,
  MemberContribution,
  myContribution,
  needsPayment,
  progressPercent,
} from '../../../domain/contribution-tracking';
import { findSpace } from '../../../domain/household';
import { formatCentsShort } from '../../../domain/money';
import { currentMonth } from '../../../domain/month';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon, PlusIcon } from '../Icons';
import { LoadingScreen } from '../LoadingScreen';
import { MonthPicker } from '../MonthPicker';
import { useToast } from '../Toast';
import { buttonPrimary } from '../ui';
import { ContributionPaymentSheet } from './ContributionPaymentSheet';

const STATUS_STYLE: Record<ContributionStatus, { icon: typeof CheckIcon; badge: string; bar: string }> = {
  PAID: { icon: CheckIcon, badge: 'bg-success/10 text-success', bar: 'bg-success' },
  OVERPAID: { icon: CheckIcon, badge: 'bg-success/10 text-success', bar: 'bg-success' },
  PARTIAL: { icon: ClockIcon, badge: 'bg-plaisir/15 text-ink', bar: 'bg-plaisir' },
  PENDING: { icon: AlertIcon, badge: 'bg-error/10 text-error', bar: 'bg-error' },
  NONE: { icon: InfoIcon, badge: 'bg-soft-cloud text-ink', bar: 'bg-mute' },
  UNKNOWN: { icon: InfoIcon, badge: 'bg-soft-cloud text-ink', bar: 'bg-mute' },
};

function MemberBlock({ member }: { member: MemberContribution }) {
  const style = STATUS_STYLE[member.status];
  const Icon = style.icon;
  const percent = progressPercent(member);
  const progress = describeProgress(member);
  return (
    <li
      className={`flex flex-col gap-sm rounded p-md ${member.isMe ? 'border-2 border-ink bg-white' : 'border border-hairline-soft bg-white'}`}
      data-testid="contribution-member"
      data-me={member.isMe ? 'true' : undefined}
      data-status={member.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="min-w-0 break-words font-body-md text-body-md font-semibold">
          {member.name}
          {member.isMe && <span className="ml-1 font-body-sm text-body-sm font-normal text-mute">(vous)</span>}
        </p>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-md py-0.5 font-body-sm text-body-sm font-semibold ${style.badge}`}>
          <Icon width={16} height={16} />
          {CONTRIBUTION_STATUS_LABEL[member.status]}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-sm font-body-sm text-body-sm">
        <div>
          <dt className="text-mute">Attendu</dt>
          <dd className="tabular font-semibold">{member.expectedCents === null ? '—' : formatCentsShort(member.expectedCents)}</dd>
        </div>
        <div>
          <dt className="text-mute">Versé</dt>
          <dd className="tabular font-semibold">{formatCentsShort(member.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-mute">Reste</dt>
          <dd className="tabular font-semibold">{member.remainingCents === null ? '—' : formatCentsShort(member.remainingCents)}</dd>
        </div>
      </dl>
      {percent !== null && progress && (
        <div
          role="progressbar"
          aria-label={`Contribution de ${member.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={progress}
          className="h-3 w-full overflow-hidden rounded-full bg-soft-cloud"
        >
          <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className="font-body-sm text-body-sm text-mute">{describeMemberStatus(member)}</p>
    </li>
  );
}

/**
 * « Contributions du mois » : ce que chaque membre doit verser au commun, ce qui a été versé et ce qui reste, plus le bouton
 * « J'ai versé ma contribution ». `?verser=1` (lien du conseil) fait défiler jusqu'ici et ouvre le versement s'il y a quelque chose à verser.
 */
export function ContributionStatusCard({ now = () => new Date() }: { now?: () => Date }) {
  const household = useRequiredHousehold();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const wantsPayment = params.get('verser') === '1';
  const [month, setMonth] = useState(() => currentMonth(now()));
  const [version, setVersion] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const status = useContributionStatus(month, version);
  const ref = useRef<HTMLElement | null>(null);
  const handled = useRef(false);

  const report = status.data;
  const me = report ? myContribution(report) : null;
  const common = findSpace(household, 'COMMON');
  const personal = findSpace(household, 'PERSONAL');

  // Arrivée par le conseil « Verser ma contribution » : on montre la carte, et on ouvre le versement s'il reste quelque chose à verser.
  useEffect(() => {
    if (!wantsPayment || handled.current) {
      return;
    }
    ref.current?.scrollIntoView?.({ block: 'start' });
    if (report) {
      handled.current = true;
      if (me && needsPayment(me) && common) {
        setSheetOpen(true);
      }
      setParams({}, { replace: true });
    }
  }, [wantsPayment, report, me, common, setParams]);

  const offline = isOfflineError(status.error);
  const { reload } = status;
  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [offline, reload]);

  return (
    <section ref={ref} id="contributions" aria-label="Contributions du mois" className="flex flex-col gap-md rounded bg-white p-gutter shadow-[0_0_0_1px_#E5E5E5]">
      <h3 className="font-label-caps text-label-caps uppercase text-mute">Contributions du mois</h3>
      <p className="font-body-sm text-body-sm text-mute">Ce que chacun verse pour financer l’espace commun, selon la règle choisie ci-dessus.</p>
      <MonthPicker month={month} onChange={setMonth} maxMonth={maxContributionMonth(now())} />

      {report ? (
        <>
          {report.incomplete && (
            <div role="note" aria-label="Revenus manquants" className="flex flex-col items-start gap-sm rounded bg-soft-cloud p-md">
              <p className="flex items-start gap-sm font-body-sm text-body-sm">
                <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
                {INCOMPLETE_MESSAGE}
              </p>
              <a href="#mon-revenu" className="inline-flex min-h-[44px] items-center font-body-sm text-body-sm font-semibold underline">
                Renseigner mon revenu
              </a>
            </div>
          )}

          {report.members.length === 0 ? (
            <p className="font-body-sm text-body-sm text-mute">Aucun membre à afficher pour ce mois.</p>
          ) : (
            <ul aria-label="Contribution de chaque membre" className="flex flex-col gap-sm">
              {report.members.map((member) => (
                <MemberBlock key={member.userId} member={member} />
              ))}
            </ul>
          )}

          <p className="font-body-sm text-body-sm font-semibold" data-testid="contribution-totals">
            {describeTotals(report)}
          </p>

          {me && common && (
            <button type="button" onClick={() => setSheetOpen(true)} className={`${buttonPrimary} w-full`}>
              <PlusIcon width={18} height={18} />
              J’ai versé ma contribution
            </button>
          )}
        </>
      ) : offline ? (
        <OfflineNotice message="Hors ligne : le suivi des contributions reviendra avec le réseau." onRetry={reload} />
      ) : status.error ? (
        <ErrorNotice message={describeError(status.error, 'Impossible de charger les contributions du mois.')} onRetry={reload} />
      ) : (
        <LoadingScreen />
      )}

      {sheetOpen && common && (
        <ContributionPaymentSheet
          month={month}
          member={me}
          commonSpaceId={common.id}
          personalSpaceId={personal?.id ?? null}
          now={now}
          onClose={() => setSheetOpen(false)}
          onPaid={(payload) => {
            setSheetOpen(false);
            setVersion((value) => value + 1);
            toast.show(`Contribution enregistrée : ${describePayment(payload)}`);
          }}
        />
      )}
    </section>
  );
}
