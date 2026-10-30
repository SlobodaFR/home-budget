import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, isOfflineError } from '../../application/error-message';
import { useDebtActions } from '../../application/use-debt-actions';
import { useDebts, useDebtsSummary } from '../../application/use-debts';
import { useRecurringOptions } from '../../application/use-recurring-options';
import { useSpace } from '../../application/use-space';
import { activeDebts, archivedDebts, Debt, DebtPayload, sortDebts } from '../../domain/debt';
import { DebtCard } from '../components/debts/DebtCard';
import { DebtDetail } from '../components/debts/DebtDetail';
import { DebtForm } from '../components/debts/DebtForm';
import { DebtsSummaryCard } from '../components/debts/DebtsSummaryCard';
import { ErrorNotice, OfflineNotice } from '../components/ErrorNotice';
import { ChevronLeftIcon, ChevronRightIcon, CreditCardIcon, PlusIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { useToast } from '../components/Toast';
import { buttonPrimary, cardClass } from '../components/ui';

type SheetState = { type: 'form'; editing: Debt | null } | { type: 'detail'; id: string } | null;

export function DettesPage() {
  const { space, kind } = useSpace();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<SheetState>(null);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  const debts = useDebts(space.id, version);
  const summary = useDebtsSummary(space.id, version);
  const actions = useDebtActions(space.id, refresh);
  const recurring = useRecurringOptions(space.id);

  const offline = isOfflineError(debts.error);
  const retry = () => {
    debts.reload();
    summary.reload();
  };

  useEffect(() => {
    if (!offline) {
      return undefined;
    }
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  });

  const closeSheet = useCallback(() => setSheet(null), []);
  // Le client trie déjà ; on ne s'y fie pas (un crédit qui ne diminue pas doit toujours passer en tête).
  const list = sortDebts(debts.data ?? []);
  const detailDebt = sheet?.type === 'detail' ? (list.find((debt) => debt.id === sheet.id) ?? null) : null;

  const handleSubmit = async (payload: DebtPayload) => {
    const editing = sheet?.type === 'form' ? sheet.editing : null;
    try {
      if (editing) {
        await actions.update(editing, payload);
        toast.show('Crédit modifié');
      } else {
        await actions.create(payload);
        toast.show('Crédit ajouté');
      }
    } catch (error) {
      throw new Error(
        describeError(error, 'L’enregistrement a échoué. Vérifiez les informations (le capital restant ne peut pas dépasser le capital emprunté) et réessayez.'),
      );
    }
    closeSheet();
  };

  const handleToggleArchive = async (debt: Debt) => {
    try {
      await actions.setArchived(debt, !debt.archived);
      toast.show(debt.archived ? 'Crédit désarchivé' : 'Crédit archivé : il ne compte plus dans vos mensualités');
      closeSheet();
    } catch (error) {
      toast.show(describeError(error, 'Modification impossible.'), 'error');
    }
  };

  const handleDelete = async (debt: Debt) => {
    try {
      await actions.remove(debt);
      toast.show('Crédit supprimé');
      closeSheet();
    } catch (error) {
      toast.show(describeError(error, 'Suppression impossible.'), 'error');
    }
  };

  const active = activeDebts(list);
  const archived = archivedDebts(list);
  const renderCard = (debt: Debt) => (
    <DebtCard key={debt.id} debt={debt} onOpen={(target) => setSheet({ type: 'detail', id: target.id })} onEdit={(target) => setSheet({ type: 'form', editing: target })} />
  );

  return (
    <>
      <div>
        <Link to="/" className="-ml-2 inline-flex min-h-[44px] items-center gap-1 px-2 font-body-sm text-body-sm font-semibold">
          <ChevronLeftIcon width={18} height={18} />
          Accueil
        </Link>
        <h2 className="font-heading-lg text-heading-lg">Crédits {kind === 'COMMON' ? 'communs' : 'perso'}</h2>
        <p className="font-body-sm text-body-sm text-mute">Immobilier, auto, consommation… de l’espace « {space.name} ». Les chiffres sont des estimations.</p>
      </div>

      {summary.data && debts.data && <DebtsSummaryCard summary={summary.data} />}

      {debts.data ? (
        list.length === 0 ? (
          <section aria-label="À quoi sert le suivi des crédits" className={`${cardClass} flex flex-col gap-md`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft-cloud">
              <CreditCardIcon width={24} height={24} />
            </span>
            <h3 className="font-heading-lg text-heading-lg">À quoi sert le suivi des crédits&nbsp;?</h3>
            <p className="font-body-md text-body-md">
              Notez vos crédits pour voir d’un coup d’œil <span className="font-semibold">combien il reste à rembourser</span>, <span className="font-semibold">quand ils se termineront</span> et
              combien d’intérêts il reste à payer.
            </p>
            <p className="font-body-sm text-body-sm text-mute">
              Vous pourrez aussi tester « et si je remboursais plus vite ? » pour voir l’effet sur la durée et les intérêts. Il vous faut seulement le tableau d’amortissement ou le relevé de la banque.
            </p>
            <button type="button" onClick={() => setSheet({ type: 'form', editing: null })} className={`${buttonPrimary} w-full`}>
              <PlusIcon width={18} height={18} />
              Ajouter mon premier crédit
            </button>
          </section>
        ) : (
          <>
            <button type="button" onClick={() => setSheet({ type: 'form', editing: null })} className={`${buttonPrimary} w-full`}>
              <PlusIcon width={18} height={18} />
              Nouveau crédit
            </button>
            {active.length > 0 && (
              <ul aria-label="Crédits en cours" className="flex flex-col gap-gutter">
                {active.map(renderCard)}
              </ul>
            )}
            {archived.length > 0 && (
              <details className="group rounded bg-white shadow-[0_0_0_1px_#E5E5E5]">
                <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-md px-gutter font-body-md text-body-md font-semibold">
                  <span>Crédits archivés ({archived.length})</span>
                  <ChevronRightIcon width={20} height={20} className="transition-transform group-open:rotate-90" />
                </summary>
                <ul aria-label="Crédits archivés" className="flex flex-col gap-gutter p-gutter pt-0">
                  {archived.map(renderCard)}
                </ul>
              </details>
            )}
          </>
        )
      ) : offline ? (
        <OfflineNotice message="Hors ligne : vos crédits reviendront avec le réseau." onRetry={retry} />
      ) : debts.error ? (
        <ErrorNotice message={describeError(debts.error, 'Impossible de charger les crédits.')} onRetry={debts.reload} />
      ) : (
        <LoadingScreen />
      )}

      {sheet?.type === 'form' && <DebtForm key={sheet.editing?.id ?? 'new'} editing={sheet.editing} recurring={recurring} onClose={closeSheet} onSubmit={handleSubmit} />}
      {detailDebt && (
        <DebtDetail
          key={detailDebt.id}
          debt={detailDebt}
          spaceId={space.id}
          busy={actions.busy}
          onClose={closeSheet}
          onEdit={(target) => setSheet({ type: 'form', editing: target })}
          onToggleArchive={handleToggleArchive}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
