export const buttonPrimary =
  'inline-flex min-h-[48px] items-center justify-center gap-sm rounded-full bg-ink px-xl font-button-md text-button-md text-surface transition-opacity [@media(hover:hover)]:hover:[&:not(:disabled)]:opacity-85 disabled:opacity-40';

export const buttonSecondary =
  'inline-flex min-h-[48px] items-center justify-center gap-sm rounded-full border border-hairline bg-transparent px-xl font-button-md text-button-md text-ink transition-colors hover:bg-soft-cloud disabled:opacity-40';

export const inputClass =
  'min-h-[48px] w-full rounded border border-hairline bg-white px-gutter font-body-md text-body-md text-ink placeholder:text-mute';

export const cardClass = 'rounded bg-white p-gutter shadow-[0_0_0_1px_#E5E5E5]';

export const labelClass =
  'mb-1 block font-label-caps text-label-caps uppercase text-mute';

/** Les boutons ronds « précédent » et « suivant » des sélecteurs de mois et d'année. */
export const stepButtonClass =
  'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-hairline-soft bg-white hover:bg-soft-cloud';
