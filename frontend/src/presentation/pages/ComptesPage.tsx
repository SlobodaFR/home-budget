import { useCallback, useState } from 'react';
import { describeError } from '../../application/error-message';
import { useAccountActions } from '../../application/use-account-actions';
import { useAccounts } from '../../application/use-accounts';
import { useSpace } from '../../application/use-space';
import { Account, AccountPayload, activeAccounts, archivedAccounts } from '../../domain/account';
import { AccountCard } from '../components/accounts/AccountCard';
import { AccountsOverview } from '../components/accounts/AccountsOverview';
import { AccountForm } from '../components/accounts/AccountForm';
import { ErrorNotice } from '../components/ErrorNotice';
import { BankIcon, PlusIcon } from '../components/Icons';
import { LoadingScreen } from '../components/LoadingScreen';
import { useToast } from '../components/Toast';
import { buttonPrimary, cardClass } from '../components/ui';
import { CardGrid, PageIntro } from '../layout/PageLayout';

type SheetState = { editing: Account | null } | null;

export function ComptesPage() {
  const { space, kind } = useSpace();
  const { accounts, loaded, error, reload } = useAccounts();
  const actions = useAccountActions(space.id);
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  const active = activeAccounts(accounts);
  const archived = archivedAccounts(accounts);

  const handleSubmit = async (payload: AccountPayload) => {
    const editing = sheet?.editing ?? null;
    try {
      if (editing) {
        await actions.update(editing, payload);
        toast.show('Compte modifié');
      } else {
        await actions.create(payload);
        toast.show('Compte ajouté');
      }
    } catch (failure) {
      throw new Error(describeError(failure, 'L’enregistrement a échoué. Vérifiez les informations (le nom doit être unique) et réessayez.'));
    }
    closeSheet();
  };

  const handleToggleArchive = async (account: Account) => {
    try {
      await actions.setArchived(account, !account.archived);
      toast.show(account.archived ? 'Compte désarchivé' : 'Compte archivé : son historique est conservé');
    } catch (failure) {
      toast.show(describeError(failure, 'Modification impossible.'), 'error');
    }
  };

  const handleDelete = async (account: Account) => {
    await actions.remove(account);
    toast.show('Compte supprimé');
  };

  const renderCard = (account: Account) => (
    <AccountCard
      key={account.id}
      account={account}
      busy={actions.busy}
      onEdit={(target) => setSheet({ editing: target })}
      onToggleArchive={(item) => void handleToggleArchive(item)}
      onDelete={handleDelete}
    />
  );

  return (
    <>
      <PageIntro
        title={`Comptes ${kind === 'COMMON' ? 'communs' : 'perso'}`}
        description={`Où circule l’argent de l’espace « ${space.name} ».`}
        back={{ to: '/', label: 'Accueil' }}
      />

      {!loaded && accounts.length === 0 ? (
        <LoadingScreen />
      ) : error && accounts.length === 0 ? (
        <ErrorNotice message={describeError(error, 'Impossible de charger les comptes.')} onRetry={reload} />
      ) : accounts.length === 0 ? (
        <section aria-label="À quoi servent les comptes" className={`${cardClass} flex flex-col gap-md`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft-cloud">
            <BankIcon width={24} height={24} />
          </span>
          <h3 className="font-heading-lg text-heading-lg">À quoi servent les comptes&nbsp;?</h3>
          <p className="font-body-md text-body-md">
            Un compte dit <span className="font-semibold">où l’argent circule</span> (compte courant, livret, espèces), alors que l’espace dit{' '}
            <span className="font-semibold">qui décide du budget</span>. En ajoutant vos comptes, vous suivez leur solde et vous voyez à l’avance
            celui qui risque de passer sous zéro.
          </p>
          <p className="font-body-sm text-body-sm text-mute">C’est facultatif : le budget fonctionne très bien sans compte.</p>
          <button type="button" onClick={() => setSheet({ editing: null })} className={`${buttonPrimary} w-full`}>
            <PlusIcon width={18} height={18} />
            Ajouter mon premier compte
          </button>
        </section>
      ) : (
        <>
          <AccountsOverview accounts={accounts} />
          <button type="button" onClick={() => setSheet({ editing: null })} className={`${buttonPrimary} w-full lg:w-fit lg:self-start`}>
            <PlusIcon width={18} height={18} />
            Ajouter un compte
          </button>
          {active.length > 0 && <CardGrid columns={3}>{active.map(renderCard)}</CardGrid>}
          {archived.length > 0 && (
            <section aria-label="Comptes archivés" className="flex flex-col gap-md">
              <h3 className="font-label-caps text-label-caps uppercase text-mute">Archivés</h3>
              <CardGrid columns={3}>{archived.map(renderCard)}</CardGrid>
            </section>
          )}
        </>
      )}

      {sheet && <AccountForm key={sheet.editing?.id ?? 'new'} editing={sheet.editing} existing={accounts} onClose={closeSheet} onSubmit={handleSubmit} />}
    </>
  );
}
