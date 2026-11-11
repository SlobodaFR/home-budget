import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { describeError } from '../../application/error-message';
import { useAccounts } from '../../application/use-accounts';
import { useOfflineQueue } from '../../application/use-offline-queue';
import { Transaction, TransactionPayload } from '../../domain/budget';
import { HELP_ROUTE, HELP_TITLE } from '../../domain/routes';
import { apiClient } from '../../infrastructure/api-client';
import { preferences } from '../../infrastructure/local-store';
import { useSpace } from '../../application/use-space';
import { HelpIcon, PlusIcon } from '../components/Icons';
import { QuickEntrySheet } from '../components/QuickEntrySheet';
import { SpaceSwitcher } from '../components/SpaceSwitcher';
import { TabBar } from '../components/TabBar';
import { ToastProvider, useToast } from '../components/Toast';
import { buttonPrimary } from '../components/ui';
import { QuickEntryContext, QuickEntryValue } from './QuickEntryContext';
import { routeTitle } from './navigation';
import { SideNav } from './SideNav';
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
  const showsSpace = ['/', '/plan', '/import', '/previsionnel', '/comptes', '/projets', '/revue', '/dettes', '/tendances'].includes(location.pathname);
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

  const title = routeTitle(location.pathname);
  const mobileTitle = showsSpace ? null : location.pathname === HELP_ROUTE ? HELP_TITLE : 'Foyer';
  const addButtonVisible = location.pathname === '/';

  return (
    <QuickEntryContext.Provider value={quickEntry}>
      <div className="h-dvh bg-soft-cloud lg:flex">
        <a
          href="#contenu-principal"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-lg focus:py-sm focus:font-button-md focus:text-button-md focus:text-surface"
        >
          Aller au contenu
        </a>
        <SideNav />
        <div className="relative mx-auto flex h-full w-full max-w-[600px] flex-col bg-surface md:max-w-[880px] md:border-x md:border-hairline-soft lg:mx-0 lg:min-w-0 lg:max-w-none lg:flex-1 lg:border-x-0">
          <header className="shrink-0 border-b border-hairline-soft bg-surface pb-md pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:pl-[max(32px,env(safe-area-inset-left))] md:pr-[max(32px,env(safe-area-inset-right))] lg:px-8 lg:pb-0 lg:pt-0 xl:px-10">
            <div className="mx-auto flex w-full items-start gap-sm pt-md lg:min-h-[72px] lg:max-w-[1200px] lg:items-center lg:gap-lg lg:py-5 xl:max-w-[1280px]">
              {showsSpace ? (
                <>
                  <h1 className="hidden min-w-0 flex-1 truncate font-heading-xl text-heading-xl lg:block">{title}</h1>
                  <div className="min-w-0 flex-1 lg:w-[280px] lg:flex-none">
                    <SpaceSwitcher />
                  </div>
                  <Link
                    to={HELP_ROUTE}
                    aria-label={HELP_TITLE}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-hairline-soft bg-white text-ink hover:bg-soft-cloud lg:h-12 lg:w-12"
                  >
                    <HelpIcon width={24} height={24} />
                  </Link>
                  {addButtonVisible && (
                    <button
                      type="button"
                      onClick={quickEntry.openNew}
                      aria-label="Ajouter une opération"
                      className={`${buttonPrimary} hidden shrink-0 lg:inline-flex`}
                    >
                      <PlusIcon width={20} height={20} />
                      <span className="hidden xl:inline">Ajouter une opération</span>
                      <span className="xl:hidden">Ajouter</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <h1
                    className={`py-sm text-center font-heading-lg text-heading-lg ${
                      mobileTitle === title ? 'lg:text-left lg:font-heading-xl lg:text-heading-xl' : 'lg:hidden'
                    }`}
                  >
                    {mobileTitle}
                  </h1>
                  {mobileTitle !== title && <h1 className="hidden truncate font-heading-xl text-heading-xl lg:block">{title}</h1>}
                </div>
              )}
            </div>
          </header>
          <main
            id="contenu-principal"
            tabIndex={-1}
            className={`focus:outline-none min-h-0 flex-1 overflow-y-auto ${reservesFabSpace ? 'pb-[120px]' : 'pb-0'} pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-md md:pl-[max(32px,env(safe-area-inset-left))] md:pr-[max(32px,env(safe-area-inset-right))] lg:px-8 lg:pb-16 lg:pt-8 xl:px-10`}
          >
            <div className="mx-auto flex w-full flex-col gap-gutter lg:max-w-[1200px] lg:gap-6 xl:max-w-[1280px]">
              <SyncBanner />
              <Outlet />
            </div>
          </main>
          {location.pathname === '/' && (
            <button
              type="button"
              onClick={quickEntry.openNew}
              aria-label="Ajouter une opération"
              className="absolute bottom-[calc(env(safe-area-inset-bottom)+72px)] right-margin-mobile flex h-14 w-14 items-center justify-center rounded-full bg-ink text-surface shadow-xl transition-transform active:scale-95 lg:hidden"
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
