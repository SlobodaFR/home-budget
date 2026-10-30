import { FormEvent, useState } from 'react';
import { describeImportError } from '../../../application/import-error';
import { isOfflineError } from '../../../application/error-message';
import { useOnlineStatus } from '../../../application/use-online-status';
import { useResource } from '../../../application/use-resource';
import { addRule, moveRule, removeRule } from '../../../domain/rule-list';
import { IMPORT_TARGETS, ImportTarget, Rule, TARGET_LABEL } from '../../../domain/statement-import';
import { apiClient } from '../../../infrastructure/api-client';
import { ErrorNotice, OfflineNotice } from '../ErrorNotice';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '../Icons';
import { LoadingScreen } from '../LoadingScreen';
import { useToast } from '../Toast';
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../ui';
import { TARGET_STYLE } from './target-style';

const iconButton =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-soft-cloud disabled:opacity-30';

export function RulesEditor({ spaceId }: { spaceId: string }) {
  const online = useOnlineStatus();
  const toast = useToast();
  const resource = useResource(() => apiClient.fetchRules(spaceId), [spaceId]);
  const [draft, setDraft] = useState<Rule[] | null>(null);
  const [keyword, setKeyword] = useState('');
  const [target, setTarget] = useState<ImportTarget>('COURANT');
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (resource.error && !resource.data) {
    return isOfflineError(resource.error) ? (
      <OfflineNotice message="Les règles demandent une connexion." onRetry={resource.reload} />
    ) : (
      <ErrorNotice message={describeImportError(resource.error, 'Impossible de charger les règles.')} onRetry={resource.reload} />
    );
  }
  if (!resource.data) {
    return <LoadingScreen label="Chargement des règles…" />;
  }

  const rules = draft ?? resource.data.rules;
  const dirty = draft !== null;

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const result = addRule(rules, keyword, target);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    setAddError(null);
    setKeyword('');
    setDraft(result.rules);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.saveRules(spaceId, rules);
      setDraft(null);
      resource.reload();
      toast.show('Règles enregistrées');
    } catch (error) {
      setSaveError(describeImportError(error, 'Les règles n’ont pas pu être enregistrées.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <p className="font-body-sm text-body-sm text-mute">
        {resource.data.isDefault
          ? 'Ce sont les règles de départ : elles deviennent les vôtres dès l’enregistrement.'
          : 'Ces règles sont propres à cet espace.'}{' '}
        Un mot-clé correspond s’il figure dans le libellé, sans tenir compte des majuscules ni des accents. Les règles « Ignorer »
        passent en premier ; pour les autres, la première qui correspond l’emporte.
      </p>

      {rules.length === 0 ? (
        <p className="rounded bg-soft-cloud p-gutter text-center font-body-sm text-body-sm text-mute">Aucune règle.</p>
      ) : (
        <ul className="divide-y divide-hairline-soft">
          {rules.map((rule, index) => (
            <li key={`${rule.keyword}-${index}`} className="flex items-center gap-sm py-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-body-md text-body-md font-semibold">{rule.keyword}</span>
                <span className="flex items-center gap-sm font-body-sm text-body-sm text-mute">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${TARGET_STYLE[rule.target].dot}`} aria-hidden="true" />
                  {TARGET_LABEL[rule.target]}
                </span>
              </span>
              <button
                type="button"
                className={iconButton}
                aria-label={`Monter la règle ${rule.keyword}`}
                disabled={index === 0}
                onClick={() => setDraft(moveRule(rules, index, -1))}
              >
                <ArrowUpIcon width={20} height={20} />
              </button>
              <button
                type="button"
                className={iconButton}
                aria-label={`Descendre la règle ${rule.keyword}`}
                disabled={index === rules.length - 1}
                onClick={() => setDraft(moveRule(rules, index, 1))}
              >
                <ArrowDownIcon width={20} height={20} />
              </button>
              <button
                type="button"
                className={`${iconButton} text-mute hover:text-error`}
                aria-label={`Supprimer la règle ${rule.keyword}`}
                onClick={() => setDraft(removeRule(rules, index))}
              >
                <TrashIcon width={20} height={20} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} noValidate className="flex flex-col gap-sm rounded bg-soft-cloud p-md">
        <div>
          <label htmlFor="rule-keyword" className={labelClass}>
            Nouvelle règle : mot-clé
          </label>
          <input
            id="rule-keyword"
            type="text"
            value={keyword}
            maxLength={60}
            autoComplete="off"
            placeholder="ex. boulangerie"
            onChange={(event) => setKeyword(event.target.value)}
            aria-invalid={addError ? true : undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="rule-target" className={labelClass}>
            Classer dans
          </label>
          <select
            id="rule-target"
            value={target}
            onChange={(event) => setTarget(event.target.value as ImportTarget)}
            className={inputClass}
          >
            {IMPORT_TARGETS.map((option) => (
              <option key={option} value={option}>
                {TARGET_LABEL[option]}
              </option>
            ))}
          </select>
        </div>
        {addError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {addError}
          </p>
        )}
        <button type="submit" className={`${buttonSecondary} bg-white`}>
          Ajouter la règle
        </button>
      </form>

      {saveError && <ErrorNotice message={saveError} />}
      <button type="button" disabled={!dirty || saving || !online} onClick={handleSave} className={buttonPrimary}>
        {saving ? 'Enregistrement…' : 'Enregistrer les règles'}
      </button>
      {!online && <p className="font-body-sm text-body-sm text-mute">Hors ligne : l’enregistrement des règles attend le réseau.</p>}
    </div>
  );
}
