import { useState } from 'react';
import { useImportReview } from '../../../application/use-import-review';
import { pluralize } from '../../../domain/plural';
import { LearnedRule } from '../../../domain/rule-keyword';
import { CommitItem, ImportPreview, MAX_COMMIT_ITEMS, PreviewRow } from '../../../domain/statement-import';
import { ErrorNotice } from '../ErrorNotice';
import { ChevronRightIcon } from '../Icons';
import { buttonPrimary, buttonSecondary } from '../ui';
import { ImportRowCard } from './ImportRowCard';
import { ImportTotalsCard } from './ImportTotalsCard';
import { SkippedLines } from './SkippedLines';

export interface ReviewResult {
  items: CommitItem[];
  learned: LearnedRule[];
}

interface Props {
  preview: ImportPreview;
  submitting: boolean;
  error: string | null;
  onSubmit: (result: ReviewResult) => void;
  onBack: () => void;
}

function scrollToFirstUnclassified(rows: readonly PreviewRow[], isUnclassified: (row: PreviewRow) => boolean) {
  const target = rows.find(isUnclassified);
  if (target) {
    document.getElementById(`import-row-${target.index}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }
}

export function ImportReview({ preview, submitting, error, onSubmit, onBack }: Props) {
  const review = useImportReview(preview.rows);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const { totals, groups, choices } = review;

  if (preview.rows.length === 0) {
    return (
      <div className="flex flex-col gap-gutter">
        <p className="rounded bg-soft-cloud p-gutter text-center font-body-sm text-body-sm text-mute">
          Aucune ligne reconnue dans ce relevé. Vérifiez qu’il s’agit bien d’un export CSV avec une date et un montant par ligne.
        </p>
        <SkippedLines skipped={preview.skipped} />
        <button type="button" onClick={onBack} className={buttonSecondary}>
          Choisir un autre relevé
        </button>
      </div>
    );
  }

  const renderRow = (row: PreviewRow) => {
    const choice = choices[row.index] ?? null;
    const initial = review.initial[row.index] ?? null;
    return (
      <ImportRowCard
        key={row.index}
        row={row}
        choice={choice}
        initial={initial}
        similarCount={choice !== null && choice !== initial ? review.similarCount(row.index) : 0}
        learnKeyword={review.learn[row.index]}
        onChoose={review.choose}
        onClassifySimilar={review.classifySimilar}
        onLearn={review.setLearn}
      />
    );
  };

  const remaining = totals.toClassifyCount;
  const tooMany = totals.toCreateCount > MAX_COMMIT_ITEMS;
  const blocked = remaining > 0 || totals.toCreateCount === 0 || tooMany || submitting;
  const remainingInGroup = groups.toClassify.filter((row) => choices[row.index] === null).length;

  return (
    <div className="flex flex-col gap-gutter">
      <p className="font-body-sm text-body-sm text-mute">
        {pluralize(preview.rows.length, 'ligne lue', 'lignes lues')}. Chaque ligne doit être classée ou ignorée avant l’import.
      </p>

      {preview.truncated && (
        <p role="status" className="rounded border border-plaisir/40 bg-plaisir/10 p-md font-body-sm text-body-sm">
          Relevé tronqué : seules les premières lignes ont été lues. Importez le reste dans un second fichier.
        </p>
      )}
      <SkippedLines skipped={preview.skipped} />

      <ImportTotalsCard totals={totals} learnedCount={review.learnedCount} />

      {groups.toClassify.length > 0 && (
        <section aria-labelledby="group-to-classify" className="flex flex-col gap-sm">
          <h3 id="group-to-classify" className="font-label-caps text-label-caps uppercase text-mute">
            À classer ({remainingInGroup === 0 ? 'terminé' : pluralize(remainingInGroup, 'restante', 'restantes')})
          </h3>
          <ul className="flex flex-col gap-sm">{groups.toClassify.map(renderRow)}</ul>
        </section>
      )}

      {groups.classified.length > 0 && (
        <section aria-labelledby="group-classified" className="flex flex-col gap-sm">
          <h3 id="group-classified" className="font-label-caps text-label-caps uppercase text-mute">
            Classées ({groups.classified.length})
          </h3>
          <ul className="flex flex-col gap-sm">{groups.classified.map(renderRow)}</ul>
        </section>
      )}

      {groups.duplicates.length > 0 && (
        <section aria-labelledby="group-duplicates" className="flex flex-col gap-sm">
          <h3 id="group-duplicates" className="font-label-caps text-label-caps uppercase text-mute">
            <button
              type="button"
              aria-expanded={showDuplicates}
              aria-controls="duplicates-list"
              onClick={() => setShowDuplicates((value) => !value)}
              className="flex min-h-[44px] w-full items-center justify-between gap-md uppercase"
            >
              Déjà importées ({groups.duplicates.length}) · ignorées par défaut
              <ChevronRightIcon width={18} height={18} className={showDuplicates ? 'rotate-90' : ''} />
            </button>
          </h3>
          {showDuplicates && (
            <ul id="duplicates-list" className="flex flex-col gap-sm">
              {groups.duplicates.map(renderRow)}
            </ul>
          )}
        </section>
      )}

      <div className="sticky bottom-0 z-10 -mx-margin-mobile flex flex-col gap-sm border-t border-hairline-soft bg-surface px-margin-mobile py-md">
        {error && (
          <div className="max-h-[30dvh] overflow-y-auto">
            <ErrorNotice message={error} />
          </div>
        )}
        {tooMany && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            Un import est limité à {MAX_COMMIT_ITEMS} opérations : ignorez {totals.toCreateCount - MAX_COMMIT_ITEMS} lignes de plus ou
            importez le relevé en deux fois.
          </p>
        )}
        <div className="flex items-center gap-sm">
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => scrollToFirstUnclassified(preview.rows, (row) => choices[row.index] === null)}
              className="min-h-[48px] shrink-0 rounded-full border-2 border-ink px-lg font-button-md text-body-sm font-semibold"
            >
              {remaining} à classer
            </button>
          ) : (
            <span className="shrink-0 px-sm font-body-sm text-body-sm font-semibold text-success">Tout est classé</span>
          )}
          <button
            type="button"
            disabled={blocked}
            onClick={() => onSubmit(review.result())}
            className={`${buttonPrimary} min-w-0 flex-1 px-lg`}
          >
            {submitting ? 'Import en cours…' : `Importer ${pluralize(totals.toCreateCount, 'opération', 'opérations')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
