import { useId, useState } from 'react';
import {
  CONFIDENCE_EXPLANATION,
  CONFIDENCE_HINT,
  EXTRACTION_FIELD_LABEL,
  ExtractedField,
  ExtractionFieldKey,
  ExtractionResult,
  extractedFieldProblem,
  formatExtractedValue,
  isCheckedByDefault,
  missingFieldLabels,
  NEVER_EXTRACTED_NOTE,
  SOURCE_NOTE,
} from '../../../../domain/debt-extraction';
import { AlertIcon } from '../../Icons';
import { buttonPrimary, buttonSecondary } from '../../ui';
import { ConfidenceBadge } from './ConfidenceBadge';

interface Props {
  result: ExtractionResult;
  /** Reçoit UNIQUEMENT les champs cochés. */
  onApply: (fields: ExtractedField[]) => void;
  onCancel: () => void;
}

/** Relecture des propositions : l'utilisateur coche ce qu'il veut reprendre (seules les valeurs « Sûr » le sont d'office). */
export function ContractReview({ result, onApply, onCancel }: Props) {
  const rows = result.fields.map((item) => ({
    item,
    problem: extractedFieldProblem(item),
  }));
  const [checked, setChecked] = useState<ReadonlySet<ExtractionFieldKey>>(
    () =>
      new Set(
        rows
          .filter(
            (row) => !row.problem && isCheckedByDefault(row.item.confidence),
          )
          .map((row) => row.item.field),
      ),
  );
  const baseId = useId();

  const toggle = (field: ExtractionFieldKey) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (!next.delete(field)) {
        next.add(field);
      }
      return next;
    });

  const chosen = result.fields.filter((item) => checked.has(item.field));
  const missing = missingFieldLabels(result.fields);
  const selectable = rows.filter((row) => !row.problem).length;

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <p className="font-body-md text-body-md">
          Voici ce qui a été lu dans votre contrat.{' '}
          <span className="font-semibold">Ce sont des propositions</span> : rien
          n’est enregistré, et vous pourrez tout corriger dans le formulaire.
          Seules les informations cochées seront reprises.
        </p>
        {result.source && (
          <p className="font-body-sm text-body-sm text-mute">
            {SOURCE_NOTE[result.source]}
          </p>
        )}
      </div>

      {result.warnings.length > 0 && (
        <section
          aria-labelledby={`${baseId}-warnings`}
          className="rounded border border-plaisir/60 bg-plaisir/10 p-md"
        >
          <h3
            id={`${baseId}-warnings`}
            className="mb-sm flex items-center gap-sm font-body-md text-body-md font-semibold"
          >
            <AlertIcon width={20} height={20} className="shrink-0" />
            À savoir avant de continuer
          </h3>
          <ul className="flex list-disc flex-col gap-sm pl-5 font-body-sm text-body-sm">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <p
          role="status"
          className="rounded bg-soft-cloud p-md font-body-md text-body-md"
        >
          Aucune information n’a pu être lue dans ce document. Vérifiez qu’il
          s’agit bien de l’offre ou du contrat de prêt, ou saisissez votre
          crédit à la main.
        </p>
      ) : (
        <>
          <details className="group rounded border border-hairline">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center px-md font-body-sm text-body-sm font-semibold">
              Que veulent dire « Sûr », « À vérifier » et « Douteux » ?
            </summary>
            <ul className="flex flex-col gap-sm px-md pb-md font-body-sm text-body-sm">
              {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                <li key={level}>{CONFIDENCE_EXPLANATION[level]}</li>
              ))}
            </ul>
          </details>

          <ul
            aria-label="Informations trouvées dans le contrat"
            className="flex flex-col gap-md md:grid md:grid-cols-2 md:items-start"
          >
            {rows.map(({ item, problem }) => {
              const id = `${baseId}-${item.field}`;
              const hint = CONFIDENCE_HINT[item.confidence];
              return (
                <li
                  key={item.field}
                  className={`rounded border bg-white p-md ${item.confidence === 'LOW' ? 'border-error/40' : 'border-hairline'}`}
                >
                  <label
                    htmlFor={id}
                    className={`flex min-h-[48px] items-start gap-md ${problem ? '' : 'cursor-pointer'}`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked.has(item.field)}
                      disabled={problem !== null}
                      onChange={() => toggle(item.field)}
                      aria-describedby={`${id}-badge`}
                      className="mt-0.5 h-6 w-6 shrink-0 accent-ink"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-label-caps text-label-caps uppercase text-mute">
                        {EXTRACTION_FIELD_LABEL[item.field]}
                      </span>
                      <span className="block break-words font-body-md text-body-md font-semibold">
                        {formatExtractedValue(item)}
                      </span>
                    </span>
                  </label>
                  <div className="mt-sm flex flex-wrap items-center gap-sm pl-[36px]">
                    <ConfidenceBadge
                      id={`${id}-badge`}
                      confidence={item.confidence}
                    />
                    {item.page !== null && (
                      <span className="font-body-sm text-body-sm text-mute">
                        page {item.page}
                      </span>
                    )}
                  </div>
                  {problem ? (
                    <p className="mt-sm pl-[36px] font-body-sm text-body-sm text-error">
                      Cette valeur ne peut pas être reprise : {problem}.
                    </p>
                  ) : (
                    hint && (
                      <p className="mt-sm pl-[36px] font-body-sm text-body-sm">
                        {hint}
                      </p>
                    )
                  )}
                  {item.snippet && (
                    <details className="group pl-[36px]">
                      <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-body-sm text-body-sm font-semibold underline">
                        Voir l’extrait du contrat
                      </summary>
                      <p className="break-words pb-sm font-body-sm text-body-sm text-mute">
                        D’après : « {item.snippet} »
                      </p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section
        aria-label="Informations à saisir à la main"
        className="flex flex-col gap-sm rounded bg-soft-cloud p-md font-body-sm text-body-sm"
      >
        {missing.length > 0 && (
          <p>
            Non trouvé dans le document : {missing.join(', ')} : à saisir à la
            main.
          </p>
        )}
        <p>{NEVER_EXTRACTED_NOTE}</p>
      </section>

      <div className="sticky bottom-0 -mx-margin-mobile flex flex-col gap-sm border-t border-hairline-soft bg-surface px-margin-mobile pb-sm pt-md md:-mx-8 md:px-8">
        <p role="status" className="font-body-sm text-body-sm text-mute">
          {selectable === 0
            ? 'Aucune information à reprendre.'
            : `${chosen.length} information${chosen.length > 1 ? 's' : ''} cochée${chosen.length > 1 ? 's' : ''} sur ${selectable}.`}
        </p>
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => onApply(chosen)}
          className={`${buttonPrimary} w-full`}
        >
          Préremplir le formulaire
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${buttonSecondary} w-full`}
        >
          Annuler et saisir à la main
        </button>
      </div>
    </div>
  );
}
