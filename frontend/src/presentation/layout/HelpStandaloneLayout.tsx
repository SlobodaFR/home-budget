import { Outlet } from 'react-router-dom';
import { HELP_TITLE } from '../../domain/routes';

/**
 * L'aide pour quelqu'un qui n'a pas encore de foyer (page de bienvenue) : la même page, sans barre d'onglets
 * puisque les onglets mènent tous à des écrans qui demandent un foyer.
 */
export function HelpStandaloneLayout() {
  return (
    <div className="min-h-dvh bg-soft-cloud">
      <div className="mx-auto flex min-h-dvh w-full max-w-[600px] flex-col bg-surface md:max-w-[880px] md:border-x md:border-hairline-soft lg:max-w-[1200px] xl:max-w-[1280px]">
        <header className="border-b border-hairline-soft bg-surface pb-md pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+12px)] md:pl-[max(32px,env(safe-area-inset-left))] md:pr-[max(32px,env(safe-area-inset-right))] lg:px-10 lg:py-6">
          <h1 className="py-sm text-center font-heading-lg text-heading-lg lg:py-0 lg:text-left lg:font-heading-xl lg:text-heading-xl">{HELP_TITLE}</h1>
        </header>
        <main className="flex flex-1 flex-col gap-gutter pb-[calc(env(safe-area-inset-bottom)+24px)] pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-md md:pl-[max(32px,env(safe-area-inset-left))] md:pr-[max(32px,env(safe-area-inset-right))] lg:px-10 lg:pb-16 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
