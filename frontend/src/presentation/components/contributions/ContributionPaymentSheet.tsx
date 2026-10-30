import { FormEvent, useRef, useState } from 'react';
import { describePaymentError, useContributionPayment, useSpaceAccounts } from '../../../application/use-contribution-status';
import { useOnlineStatus } from '../../../application/use-online-status';
import { BLOC_INFO, BLOCS } from '../../../domain/bloc';
import {
  buildContributionPayload,
  ContributionFormErrors,
  ContributionPaymentPayload,
  emptyContributionForm,
  MemberContribution,
} from '../../../domain/contribution-tracking';
import { formatCentsShort } from '../../../domain/money';
import { formatMonthLabel } from '../../../domain/month';
import { AccountSelect } from '../AccountSelect';
import { BottomSheet } from '../BottomSheet';
import { WifiOffIcon } from '../Icons';
import { BLOC_STYLE } from '../bloc-style';
import { buttonPrimary, inputClass, labelClass } from '../ui';

interface Props {
  month: string;
  /** Mon bloc dans le suivi du mois (pour préremplir le reste à verser). */
  member: MemberContribution | null;
  commonSpaceId: string;
  /** `null` : pas d'espace perso, la case « Retirer aussi de mon espace perso » n'est pas proposée. */
  personalSpaceId: string | null;
  onClose: () => void;
  /** Appelé après l'enregistrement (rafraîchit le suivi) ; le message de succès est à la charge de l'appelant. */
  onPaid: (payload: ContributionPaymentPayload) => void;
  now?: () => Date;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

/** « J'ai versé ma contribution » : un revenu est ajouté au commun, et si on le souhaite la dépense correspondante dans son espace perso. */
export function ContributionPaymentSheet({ month, member, commonSpaceId, personalSpaceId, onClose, onPaid, now = () => new Date() }: Props) {
  const online = useOnlineStatus();
  const { pay } = useContributionPayment();
  const commonAccounts = useSpaceAccounts(commonSpaceId);
  const personalAccounts = useSpaceAccounts(personalSpaceId);
  const [values, setValues] = useState(() => emptyContributionForm(member, now()));
  const [errors, setErrors] = useState<ContributionFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((previous) => ({ ...previous, [key]: value }));
  const monthLabel = formatMonthLabel(month);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildContributionPayload(values, month);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await pay(result.payload);
    } catch (error) {
      // Rien n'est créé à moitié (le serveur est atomique) et la saisie reste à l'écran.
      setSubmitError(describePaymentError(error));
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    onPaid(result.payload);
  };

  return (
    <BottomSheet title="Verser ma contribution" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        <p className="font-body-md text-body-md">
          Contribution au commun pour <span className="font-semibold">{monthLabel}</span>.
          {member?.remainingCents ? ` Il vous reste ${formatCentsShort(member.remainingCents)} à verser.` : ''}
        </p>

        <div>
          <label htmlFor="contribution-amount" className={labelClass}>
            Montant versé
          </label>
          <div className="relative">
            <input
              id="contribution-amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={values.amount}
              onChange={(event) => set('amount', event.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'contribution-amount-error' : 'contribution-amount-hint'}
              className={`${inputClass} tabular pr-10 text-right`}
            />
            <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
          </div>
          <p id="contribution-amount-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Préremplie avec ce qu’il vous reste à verser : changez-la si vous avez versé autre chose.
          </p>
          <FieldError id="contribution-amount-error" message={errors.amount} />
        </div>

        <div>
          <label htmlFor="contribution-date" className={labelClass}>
            Date du versement
          </label>
          <input
            id="contribution-date"
            type="date"
            value={values.date}
            onChange={(event) => set('date', event.target.value)}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? 'contribution-date-error' : undefined}
            className={inputClass}
          />
          <FieldError id="contribution-date-error" message={errors.date} />
        </div>

        <AccountSelect
          id="contribution-account"
          accounts={commonAccounts}
          value={values.accountId || null}
          onChange={(accountId) => set('accountId', accountId ?? '')}
          label="Compte de l’espace commun (facultatif)"
          hint="Le compte du foyer sur lequel l’argent est arrivé."
        />

        {personalSpaceId !== null && (
          <div className="flex flex-col gap-md rounded bg-soft-cloud p-md">
            <label htmlFor="contribution-debit" className="flex min-h-[44px] cursor-pointer items-start gap-md">
              <input
                id="contribution-debit"
                type="checkbox"
                checked={values.debitPersonal}
                onChange={(event) => set('debitPersonal', event.target.checked)}
                aria-labelledby="contribution-debit-title"
                aria-describedby="contribution-debit-hint"
                className="mt-1 h-6 w-6 shrink-0 accent-ink"
              />
              <span>
                <span id="contribution-debit-title" className="block font-body-md text-body-md font-semibold">
                  Retirer aussi de mon espace perso
                </span>
                <span id="contribution-debit-hint" className="block font-body-sm text-body-sm text-mute">
                  Ajoute la dépense « Contribution au foyer » dans votre espace perso, visible par vous seul : les autres ne voient que le versement côté commun.
                </span>
              </span>
            </label>

            {values.debitPersonal && (
              <>
                <div role="group" aria-label="Bloc de la dépense perso">
                  <span className={labelClass}>Bloc de la dépense</span>
                  <div className="grid grid-cols-2 gap-sm min-[420px]:grid-cols-4">
                    {BLOCS.map((bloc) => (
                      <button
                        key={bloc}
                        type="button"
                        aria-pressed={values.personalBloc === bloc}
                        onClick={() => set('personalBloc', bloc)}
                        className={`min-h-[48px] rounded-full border-2 px-sm font-button-md text-body-sm font-semibold ${
                          values.personalBloc === bloc ? BLOC_STYLE[bloc].chipOn : BLOC_STYLE[bloc].chipOff
                        }`}
                      >
                        {BLOC_INFO[bloc].label}
                      </button>
                    ))}
                  </div>
                </div>
                <AccountSelect
                  id="contribution-personal-account"
                  accounts={personalAccounts}
                  value={values.personalAccountId || null}
                  onChange={(accountId) => set('personalAccountId', accountId ?? '')}
                  label="Compte de mon espace perso (facultatif)"
                  hint="Le compte perso d’où part l’argent."
                />
              </>
            )}
          </div>
        )}

        {!online && (
          <p role="status" className="flex items-start gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
            <WifiOffIcon width={20} height={20} className="mt-0.5 shrink-0" />
            Vous êtes hors ligne. Un versement ne peut pas être mis en attente : il faut du réseau pour l’enregistrer. Vos saisies restent ici.
          </p>
        )}

        {submitError && (
          <p role="alert" className="rounded border border-error/30 bg-error/5 p-md font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : 'Enregistrer mon versement'}
        </button>
      </form>
    </BottomSheet>
  );
}
