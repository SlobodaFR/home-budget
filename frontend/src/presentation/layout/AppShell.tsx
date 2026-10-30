import { useCallback, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { describeError } from '../../application/error-message';
import { useAccounts } from '../../application/use-accounts';
import { useOfflineQueue } from '../../application/use-offline-queue';
import { Transaction, TransactionPayload } from '../../domain/budget';
import { apiClient } from '../../infrastructure/api-client';
import { preferences } from '../../infrastructure/local-store';
import { useSpace } from '../../application/use-space';
import { PlusIcon } from '../components/Icons';
import { QuickEntrySheet } from '../components/QuickEntrySheet';
import { SpaceSwitcher } from '../components/SpaceSwitcher';
import { TabBar } from '../components/TabBar';
import { ToastProvider, useToast } from '../components/Toast';
import { QuickEntryContext, QuickEntryValue } from './QuickEntryContext';
import { SyncBanner } from './SyncBanner';

type SheetState = { editing: Transaction | null } | null;

function ShellContent() {
  const location = useLocation();
  const { space } = useSpace();
  const { submit, notifyChanged } = useOfflineQueue();
  const toast = useToast();
  const { accounts, hasSelectableAccount, defaultAccountId, rememberAccount } = useAccounts();
  const [sheet, setSheet] = useState<SheetState>(null);

  const closeSheet = useCallback(() => setSheet(null), []);
  const showsSpace = ['/', '/plan', '/import', '/previsionnel', '/comptes', '/projets', '/revue'].includes(location.pathname);
  const reservesFabSpace = location.pathname !== '/import';

  const quickEntry = useMemo<QuickEntryValue>(
    () => ({
      openNew: () => setSheet({ editing: null }),
      openEdit: (transaction) => setSheet({ editing: transaction }),
    }),
    [],
  );

  const handleSubmit = async (payload: TransactionPayload) => {
    const editing = sheet?.editing ?? null;
    try {
      if (editing) {
        await apiClient.updateTransaction(space.id, editing.id, payload);
        notifyChanged();
        toast.show('Opération modifiée');
      } else {
        const result = await submit(space.id, payload);
        toast.show(
          result === 'saved'
            ? payload.kind === 'INCOME'
              ? 'Revenu enregistré'
              : 'Dépense enregistrée'
            : 'Hors ligne : enregistrée sur cet appareil, elle partira au retour du réseau.',
        );
      }
    } catch (error) {
      throw new Error(describeError(error, 'L’enregistrement a échoué. Vérifiez les informations et réessayez.'));
    }
    if (payload.bloc) {
      preferences.setLastBloc(payload.bloc);
    }
    if (!editing && hasSelectableAccount) {
      rememberAccount(payload.accountId ?? null);
    }
    closeSheet();
  };

  return (
    <QuickEntryContext.Provider value={quickEntry}>
      <div className="h-dvh bg-soft-cloud">
        <div className="relative mx-auto flex h-full w-full max-w-[600px] flex-col bg-surface md:border-x md:border-hairline-soft">
          <header className="shrink-0 border-b border-hairline-soft bg-surface pb-md pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]">
            <div className="pt-md">
              {showsSpace ? <SpaceSwitcher /> : <h1 className="py-sm text-center font-heading-lg text-heading-lg">Foyer</h1>}
            </div>
          </header>
          <main className={`min-h-0 flex-1 overflow-y-auto ${reservesFabSpace ? 'pb-[120px]' : 'pb-0'} pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-md`}>
            <div className="flex flex-col gap-gutter">
              <SyncBanner />
              <Outlet />
            </div>
          </main>
          {location.pathname === '/' && (
            <button
              type="button"
              onClick={quickEntry.openNew}
              aria-label="Ajouter une opération"
              className="absolute bottom-[calc(env(safe-area-inset-bottom)+72px)] right-margin-mobile flex h-14 w-14 items-center justify-center rounded-full bg-ink text-surface shadow-xl transition-transform active:scale-95"
            >
              <PlusIcon width={28} height={28} />
            </button>
          )}
          <TabBar />
        </div>
      </div>
      {sheet && <QuickEntrySheet
          editing={sheet.editing}
          defaultBloc={preferences.getLastBloc()}
          accounts={accounts}
          defaultAccountId={sheet.editing ? null : defaultAccountId()}
          onClose={closeSheet}
          onSubmit={handleSubmit}
        />}
    </QuickEntryContext.Provider>
  );
}

export function AppShell() {
  return (
    <ToastProvider>
      <ShellContent />
    </ToastProvider>
  );
}
