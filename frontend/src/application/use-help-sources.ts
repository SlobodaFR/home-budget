import { useEffect, useMemo } from 'react';
import { aidRuleToHelpEntry, catalogToHelpEntries, HelpEntry } from '../domain/help';
import { isOfflineError } from './error-message';
import { useAidRules } from './use-aid-rules';
import { useLifeEventCatalog } from './use-life-events';

export type HelpSourcesStatus = 'loading' | 'ready' | 'offline' | 'unavailable';

export interface HelpSources {
  /** Les règles venues du serveur, déjà prêtes à entrer dans la section « Règles officielles et sources ». */
  entries: HelpEntry[];
  status: HelpSourcesStatus;
  reload: () => void;
}

/**
 * Les crédits d'impôt (`/aid-rules`) et les démarches de naissance (`/life-events/catalog`). Un « plus » : si le serveur ne répond pas,
 * le reste de l'aide, embarquée dans l'application, fonctionne comme d'habitude.
 */
export function useHelpSources(): HelpSources {
  const rules = useAidRules(true);
  const catalog = useLifeEventCatalog();
  const { reload: reloadRules } = rules;
  const { reload: reloadCatalog } = catalog;

  const entries = useMemo(
    () => [...(rules.rules ?? []).map(aidRuleToHelpEntry), ...catalogToHelpEntries(catalog.data ?? [])],
    [rules.rules, catalog.data],
  );

  const error = rules.error ?? catalog.error;
  const loading = rules.loading || catalog.loading;
  const status: HelpSourcesStatus = loading ? 'loading' : error ? (isOfflineError(error) ? 'offline' : 'unavailable') : 'ready';

  const reload = () => {
    reloadRules();
    reloadCatalog();
  };

  useEffect(() => {
    if (status !== 'offline') {
      return undefined;
    }
    const retry = () => {
      reloadRules();
      reloadCatalog();
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [status, reloadRules, reloadCatalog]);

  return { entries, status, reload };
}
