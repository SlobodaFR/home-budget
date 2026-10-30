import { Outlet } from 'react-router-dom';
import { HELP_TITLE } from '../../domain/routes';

/**
 * L'aide pour quelqu'un qui n'a pas encore de foyer (page de bienvenue) : la même page, sans barre d'onglets
 * puisque les onglets mènent tous à des écrans qui demandent un foyer.
 */
export function HelpStandaloneLayout() {
  return (
    <div className="min-h-dvh bg-soft-cloud">
      <div className="mx-auto flex min-h-dvh w-full max-w-[600px] flex-col bg-surface md:border-x md:border-hairline-soft">
        <header className="border-b border-hairline-soft bg-surface pb-md pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+12px)]">
          <h1 className="py-sm text-center font-heading-lg text-heading-lg">{HELP_TITLE}</h1>
        </header>
        <main className="flex flex-1 flex-col gap-gutter pb-[calc(env(safe-area-inset-bottom)+24px)] pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-md">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
