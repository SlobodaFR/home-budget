import { memo, useMemo } from 'react';
import { formatCents } from '../../../domain/money';
import { formatDayMonth } from '../../../domain/month';
import { deriveKeyword, keywordError } from '../../../domain/rule-keyword';
import { ImportTarget, isManualChoice, PreviewRow, TARGET_LABEL } from '../../../domain/statement-import';
import { inputClass } from '../ui';
import { TargetChips } from './TargetChips';
import { TARGET_STYLE } from './target-style';

interface Props {
  row: PreviewRow;
  choice: ImportTarget | null;
  initial: ImportTarget | null;
  similarCount: number;
  learnKeyword: string | undefined;
  onChoose: (index: number, target: ImportTarget) => void;
  onClassifySimilar: (index: number) => void;
  onLearn: (index: number, keyword: string | null) => void;
}

function ImportRowCardView({ row, choice, initial, similarCount, learnKeyword, onChoose, onClassifySimilar, onLearn }: Props) {
  const derivedKeyword = useMemo(() => deriveKeyword(row.label), [row.label]);
  const manual = isManualChoice(choice, initial);
  const income = row.amountCents > 0;
  const ignored = choice === 'IGNORE';
  const learning = learnKeyword !== undefined;
  const keywordProblem = learning ? keywordError(learnKeyword) : null;

  return (
    <li
      id={`import-row-${row.index}`}
      className={`flex scroll-mt-md gap-md rounded border bg-white p-md [contain-intrinsic-size:auto_190px] [content-visibility:auto] ${
        choice === null ? 'border-dashed border-mute' : 'border-hairline-soft'
      } ${ignored ? 'opacity-75' : ''}`}
    >
      <span
        className={`w-1.5 shrink-0 self-stretch rounded-full ${choice === null ? 'bg-hairline' : TARGET_STYLE[choice].dot}`}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-sm">
        <div className="flex items-start justify-between gap-md">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-sm gap-y-0.5 font-body-sm text-body-sm text-mute">
              <span className="tabular">{formatDayMonth(row.date)}</span>
              {row.duplicate && (
                <span className="whitespace-nowrap rounded-full bg-soft-cloud px-sm py-0.5 text-[12px] font-bold text-ink">Déjà importée</span>
              )}
              {!manual && row.suggestion.rule && !row.duplicate && (
                <span className="whitespace-nowrap">règle « {row.suggestion.rule} »</span>
              )}
            </p>
            <p title={row.label} className="line-clamp-2 break-words font-body-md text-body-md font-semibold">
              {row.label}
            </p>
          </div>
          <p
            className={`tabular shrink-0 whitespace-nowrap font-body-md text-body-md font-semibold ${
              ignored ? 'text-mute line-through' : income ? 'text-success' : 'text-ink'
            }`}
          >
            {income ? '+ ' : '− '}
            {formatCents(Math.abs(row.amountCents))}
          </p>
        </div>

        <TargetChips label={`Classement de ${row.label}`} value={choice} onChange={(target) => onChoose(row.index, target)} />

        {manual && derivedKeyword !== '' && (
          <div className="flex flex-col gap-1">
            <label className="flex min-h-[44px] items-center gap-sm font-body-sm text-body-sm">
              <input
                type="checkbox"
                checked={learning}
                onChange={(event) => onLearn(row.index, event.target.checked ? derivedKeyword : null)}
                className="h-5 w-5 shrink-0 accent-ink"
              />
              Retenir pour la prochaine fois
            </label>
            {learning && (
              <div>
                <label htmlFor={`learn-${row.index}`} className="mb-1 block font-body-sm text-[12px] text-mute">
                  Mot-clé : toute ligne qui le contient sera classée « {choice ? TARGET_LABEL[choice] : ''} »
                </label>
                <input
                  id={`learn-${row.index}`}
                  type="text"
                  value={learnKeyword}
                  maxLength={60}
                  autoComplete="off"
                  onChange={(event) => onLearn(row.index, event.target.value)}
                  aria-invalid={keywordProblem ? true : undefined}
                  className={`${inputClass} min-h-[44px]`}
                />
                {keywordProblem && (
                  <p role="alert" className="mt-1 font-body-sm text-[12px] text-error">
                    {keywordProblem} Cette règle ne sera pas retenue.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {manual && similarCount > 0 && (
          <button
            type="button"
            onClick={() => onClassifySimilar(row.index)}
            className="min-h-[44px] rounded-full border border-ink px-lg font-button-md text-body-sm font-semibold"
          >
            Classer toutes les lignes similaires ({similarCount})
          </button>
        )}
      </div>
    </li>
  );
}

export const ImportRowCard = memo(ImportRowCardView);
