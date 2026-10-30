import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { describeImportError } from '../../application/import-error';
import { useAccounts } from '../../application/use-accounts';
import { useOfflineQueue } from '../../application/use-offline-queue';
import { useOnlineStatus } from '../../application/use-online-status';
import { useSelectedMonth } from '../../application/use-selected-month';
import { useSpace } from '../../application/use-space';
import { pluralize } from '../../domain/plural';
import { mergeLearnedRules } from '../../domain/rule-keyword';
import { dominantMonth, ImportPreview } from '../../domain/statement-import';
import { statementSizeError, textByteLength } from '../../domain/statement-decoding';
import { apiClient } from '../../infrastructure/api-client';
import { AccountSelect } from '../components/AccountSelect';
import { ChevronLeftIcon } from '../components/Icons';
import { ImportReview, ReviewResult } from '../components/import/ImportReview';
import { RulesEditor } from '../components/import/RulesEditor';
import { StatementSource } from '../components/import/StatementSource';
import { useToast } from '../components/Toast';
import { cardClass } from '../components/ui';

function RulesSection({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={cardClass}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="rules-panel"
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-[44px] w-full items-center justify-between gap-md font-label-caps text-label-caps uppercase text-mute"
        >
          Mes règles de classement
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h3>
      {open && (
        <div id="rules-panel" className="pt-md">
          <RulesEditor spaceId={spaceId} />
        </div>
      )}
    </section>
  );
}

function ImportFlow({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnlineStatus();
  const { setMonth } = useSelectedMonth();
  const { notifyChanged } = useOfflineQueue();
  const { accounts, hasSelectableAccount, defaultAccountId, rememberAccount, nameOf } = useAccounts();
  // Tant que l'utilisateur n'a rien choisi, on suit le dernier compte retenu (les comptes peuvent charger après l'arrivée sur la page).
  const [chosenAccount, setAccountId] = useState<string | null | undefined>(undefined);
  const accountId = chosenAccount === undefined ? defaultAccountId() : chosenAccount;
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const analyzingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewKey = useRef(0);
  const step = preview ? 2 : 1;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest('main')?.scrollTo?.({ top: 0 });
  }, [step]);

  const analyze = async () => {
    if (analyzingRef.current) {
      return;
    }
    const sizeError = statementSizeError(textByteLength(text));
    if (sizeError) {
      setAnalyzeError(sizeError);
      return;
    }
    analyzingRef.current = true;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await apiClient.previewImport(spaceId, text, accountId);
      reviewKey.current += 1;
      setSubmitError(null);
      setPreview(result);
    } catch (error) {
      setAnalyzeError(describeImportError(error, 'L’analyse du relevé a échoué.'));
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  const submit = async ({ items, learned }: ReviewResult) => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (learned.length > 0) {
        try {
          const current = await apiClient.fetchRules(spaceId);
          const merged = mergeLearnedRules(current.rules, learned);
          if (merged.added > 0) {
            await apiClient.saveRules(spaceId, merged.rules);
          }
        } catch (error) {
          setSubmitError(
            describeImportError(error, 'Les règles à retenir n’ont pas pu être enregistrées : rien n’a été importé. Réessayez, ou décochez « Retenir ».'),
          );
          return;
        }
      }
      let created: number;
      try {
        created = (await apiClient.commitImport(spaceId, items, accountId)).created;
      } catch (error) {
        setSubmitError(describeImportError(error, 'L’import a échoué : rien n’a été créé, vos choix sont conservés.'));
        return;
      }
      const month = dominantMonth(items);
      if (month) {
        setMonth(month);
      }
      if (hasSelectableAccount) {
        rememberAccount(accountId);
      }
      notifyChanged();
      toast.show(pluralize(created, 'opération importée', 'opérations importées'));
      navigate('/');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <div>
        {preview ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setPreview(null)}
            className="inline-flex min-h-[44px] items-center gap-1 font-body-sm text-body-sm font-semibold disabled:opacity-40"
          >
            <ChevronLeftIcon width={18} height={18} />
            Changer de relevé
          </button>
        ) : (
          <Link to="/" className="inline-flex min-h-[44px] items-center gap-1 font-body-sm text-body-sm font-semibold">
            <ChevronLeftIcon width={18} height={18} />
            Accueil
          </Link>
        )}
        <h2 ref={headingRef} tabIndex={-1} className="font-heading-lg text-heading-lg outline-none">
          Importer un relevé
        </h2>
        <p className="font-body-sm text-body-sm text-mute">
          Étape {step} sur 2 · {step === 1 ? 'Choisir le relevé' : 'Vérifier'} · Espace {spaceName}
        </p>
      </div>

      {preview && nameOf(accountId) && (
        <p className="rounded bg-soft-cloud p-md font-body-sm text-body-sm">
          Les opérations importées seront rattachées au compte <span className="font-semibold">{nameOf(accountId)}</span>.
        </p>
      )}

      {preview ? (
        <ImportReview
          key={reviewKey.current}
          preview={preview}
          submitting={submitting}
          error={submitError}
          onSubmit={submit}
          onBack={() => setPreview(null)}
        />
      ) : (
        <div className="flex flex-col gap-gutter pb-xl">
          <AccountSelect
            id="import-account"
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            label="Compte du relevé (facultatif)"
            hint="Toutes les opérations importées seront rattachées à ce compte."
          />
          <StatementSource
            text={text}
            online={online}
            analyzing={analyzing}
            error={analyzeError}
            onTextChange={setText}
            onAnalyze={analyze}
          />
          <RulesSection spaceId={spaceId} />
        </div>
      )}
    </>
  );
}

export function ImportPage() {
  const { space } = useSpace();
  return <ImportFlow key={space.id} spaceId={space.id} spaceName={space.name} />;
}
