import { useState } from 'react';
import { describeError, isOfflineError } from '../../../application/error-message';
import { useProjectDeposits } from '../../../application/use-project-deposits';
import { formatCentsShort } from '../../../domain/money';
import { formatDateInput } from '../../../domain/month';
import {
  CALCULATION_REMINDER,
  DepositPayload,
  describeCalculation,
  describeDeadline,
  describeMonthlyNeed,
  isWithdrawal,
  PROJECT_KIND_LABEL,
  Project,
  STATUS_INFO,
} from '../../../domain/project';
import { BottomSheet } from '../BottomSheet';
import { ArchiveIcon, PencilIcon, PlusIcon, TrashIcon } from '../Icons';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { LoadingScreen } from '../LoadingScreen';
import { buttonPrimary } from '../ui';
import { DepositForm } from './DepositForm';
import { ProjectProgress } from './ProjectProgress';
import { ProjectStatusBadge } from './ProjectStatusBadge';

interface Props {
  project: Project;
  spaceId: string;
  accountLabel?: string | null;
  busy: boolean;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onDelete: (project: Project) => Promise<void>;
  /** Appelé après un versement ou une suppression de versement : les totaux du projet ont changé. */
  onChanged: () => void;
  onNotify: (message: string, tone?: 'error') => void;
  now?: () => Date;
}

const actionButton =
  'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hairline px-lg font-body-sm text-body-sm font-semibold text-ink hover:bg-soft-cloud disabled:opacity-40';

export function ProjectDetail({ project, spaceId, accountLabel = null, busy, onClose, onEdit, onToggleArchive, onDelete, onChanged, onNotify, now }: Props) {
  const { deposits, add, remove, busy: depositBusy } = useProjectDeposits(spaceId, project.id, onChanged);
  const [adding, setAdding] = useState(false);
  const [confirmingDeposit, setConfirmingDeposit] = useState<string | null>(null);
  const [confirmingProject, setConfirmingProject] = useState(false);

  const handleAdd = async (payload: DepositPayload) => {
    try {
      await add(payload);
    } catch (error) {
      throw new Error(describeError(error, 'Le versement n’a pas pu être enregistré. Vérifiez le montant et réessayez.'));
    }
    onNotify(payload.amountCents < 0 ? 'Retrait enregistré' : 'Versement enregistré');
    setAdding(false);
  };

  const handleRemove = async (depositId: string) => {
    try {
      await remove(depositId);
      onNotify('Versement supprimé');
    } catch (error) {
      onNotify(describeError(error, 'Suppression impossible : le projet ne peut pas passer sous zéro.'), 'error');
    } finally {
      setConfirmingDeposit(null);
    }
  };

  const open = project.status !== 'DONE' && project.remainingCents > 0;
  const expected = project.expectedSavedCents;

  return (
    <BottomSheet title={project.name} onClose={onClose}>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-col gap-md">
          <div className="flex flex-wrap items-center gap-sm">
            <ProjectStatusBadge status={project.status} />
            <span className="font-body-sm text-body-sm text-mute">
              {PROJECT_KIND_LABEL[project.kind]}
              {accountLabel ? ` · ${accountLabel}` : ''}
              {project.archived ? ' · Archivé' : ''}
            </span>
          </div>
          <p className="font-body-sm text-body-sm">{STATUS_INFO[project.status].description}</p>
          <ProjectProgress project={project} showExpected />
          <p className="font-body-sm text-body-sm text-mute">
            {describeDeadline(project)}
            {expected > 0 && project.status !== 'DONE' && ` · Attendu à ce jour : ${formatCentsShort(expected)} (trait noir sur la barre)`}
          </p>
          <p className="font-body-md text-body-md font-semibold">{describeMonthlyNeed(project)}</p>
          {open && project.status !== 'LATE' && (
            <div className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
              <p className="font-semibold">Comment c’est calculé</p>
              <p>{CALCULATION_REMINDER}</p>
              <p className="tabular mt-1">{describeCalculation(project)}</p>
            </div>
          )}
        </div>

        {adding ? (
          <DepositForm savedCents={project.savedCents} onSubmit={handleAdd} onCancel={() => setAdding(false)} now={now} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} aria-expanded={false} className={`${buttonPrimary} w-full`}>
            <PlusIcon width={18} height={18} />
            Ajouter un versement
          </button>
        )}

        <section aria-label="Versements">
          <h3 className="font-label-caps text-label-caps uppercase text-mute">Versements</h3>
          {deposits.data ? (
            deposits.data.length === 0 ? (
              <p className="mt-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm">
                Aucun versement pour l’instant. Chaque fois que vous mettez de l’argent de côté pour ce projet, notez-le ici.
              </p>
            ) : (
              <ul className="mt-sm divide-y divide-hairline-soft">
                {deposits.data.map((deposit) => {
                  const withdrawal = isWithdrawal(deposit);
                  return (
                    <li key={deposit.id} className="py-md" data-testid="deposit-item">
                      <div className="flex items-baseline justify-between gap-md">
                        <p className="font-body-md text-body-md font-semibold">
                          {formatDateInput(deposit.date)}
                          {withdrawal && (
                            <span className="ml-sm rounded-full bg-plaisir/15 px-md py-0.5 font-body-sm text-body-sm font-semibold">Retrait</span>
                          )}
                        </p>
                        <p className={`tabular shrink-0 font-body-md text-body-md font-semibold ${withdrawal ? 'text-ink' : 'text-success'}`}>
                          {withdrawal ? '− ' : '+ '}
                          {formatCentsShort(Math.abs(deposit.amountCents))}
                        </p>
                      </div>
                      {deposit.note && <p className="break-words font-body-sm text-body-sm text-mute">{deposit.note}</p>}
                      {confirmingDeposit === deposit.id ? (
                        <div className="mt-sm flex items-center justify-between gap-md">
                          <p className="font-body-md text-body-md font-semibold">Supprimer ce versement ?</p>
                          <div className="flex shrink-0 gap-sm">
                            <button type="button" onClick={() => setConfirmingDeposit(null)} className="min-h-[44px] rounded-full border border-hairline px-lg font-button-md text-body-sm font-semibold">
                              Non
                            </button>
                            <button
                              type="button"
                              disabled={depositBusy}
                              onClick={() => void handleRemove(deposit.id)}
                              className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeposit(deposit.id)}
                          aria-label={`Supprimer le versement du ${formatDateInput(deposit.date)}`}
                          className="mt-1 inline-flex min-h-[44px] items-center gap-1 rounded-full px-md font-body-sm text-body-sm font-semibold text-error hover:bg-soft-cloud"
                        >
                          <TrashIcon width={18} height={18} />
                          Supprimer
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : isOfflineError(deposits.error) ? (
            <OfflineNotice message="Hors ligne : les versements reviendront avec le réseau." onRetry={deposits.reload} />
          ) : deposits.error ? (
            <ErrorNotice message={describeError(deposits.error, 'Impossible de charger les versements.')} onRetry={deposits.reload} />
          ) : (
            <LoadingScreen />
          )}
        </section>

        {confirmingProject ? (
          <div className="flex flex-col gap-sm rounded border border-error/40 bg-error/5 p-md">
            <p className="font-body-md text-body-md font-semibold">Supprimer ce projet et tous ses versements ?</p>
            <p className="font-body-sm text-body-sm text-mute">Pour le garder dans l’historique sans qu’il compte dans vos besoins, archivez-le plutôt.</p>
            <div className="flex gap-sm">
              <button type="button" onClick={() => setConfirmingProject(false)} className="min-h-[44px] rounded-full border border-hairline bg-white px-lg font-button-md text-body-sm font-semibold">
                Non
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDelete(project)}
                className="min-h-[44px] rounded-full bg-error px-lg font-button-md text-body-sm font-semibold text-white disabled:opacity-40"
              >
                Supprimer le projet
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-sm">
            <button type="button" onClick={() => onEdit(project)} className={actionButton}>
              <PencilIcon width={18} height={18} />
              Modifier
            </button>
            <button type="button" disabled={busy} onClick={() => onToggleArchive(project)} className={actionButton}>
              <ArchiveIcon width={18} height={18} />
              {project.archived ? 'Désarchiver' : 'Archiver'}
            </button>
            <button type="button" onClick={() => setConfirmingProject(true)} className={`${actionButton} text-error`}>
              <TrashIcon width={18} height={18} />
              Supprimer le projet
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
