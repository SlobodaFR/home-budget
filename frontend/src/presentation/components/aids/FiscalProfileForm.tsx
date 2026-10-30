import { FormEvent, useState } from 'react';
import {
  buildFiscalProfile,
  FiscalProfile,
  fiscalProfileToForm,
  FiscalProfileFormErrors,
  MAX_CHILDREN,
} from '../../../domain/aids';
import { buttonPrimary, inputClass } from '../ui';

interface Props {
  initial: FiscalProfile | null;
  saving: boolean;
  onSave: (profile: FiscalProfile) => Promise<void>;
}

export function FiscalProfileForm({ initial, saving, onSave }: Props) {
  const [values, setValues] = useState(() => fiscalProfileToForm(initial));
  const [errors, setErrors] = useState<FiscalProfileFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = buildFiscalProfile(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    try {
      await onSave(result.payload);
    } catch {
      setSubmitError('Enregistrement impossible, réessayez.');
    }
  };

  const numberField = (
    id: 'childrenUnderSix' | 'dependentChildren',
    label: string,
    hint: string,
  ) => (
    <div>
      <label htmlFor={`fiscal-${id}`} className="mb-1 block font-body-md text-body-md font-semibold">
        {label}
      </label>
      <input
        id={`fiscal-${id}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={values[id]}
        onChange={(event) => setValues((previous) => ({ ...previous, [id]: event.target.value }))}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={`fiscal-${id}-hint`}
        className={`${inputClass} tabular text-right`}
      />
      <p id={`fiscal-${id}-hint`} className={`mt-1 font-body-sm text-body-sm ${errors[id] ? 'text-error' : 'text-mute'}`} role={errors[id] ? 'alert' : undefined}>
        {errors[id] ?? hint}
      </p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
      {numberField(
        'childrenUnderSix',
        'Enfants de moins de 6 ans',
        `Au 1er janvier, gardés hors du domicile (crèche, assistante maternelle…). De 0 à ${MAX_CHILDREN}.`,
      )}
      {numberField('dependentChildren', 'Enfants à charge du foyer fiscal', `Tous les enfants que vous avez à charge. De 0 à ${MAX_CHILDREN}.`)}
      <label className="flex min-h-[44px] items-start gap-md font-body-md text-body-md">
        <input
          type="checkbox"
          checked={values.firstYearHomeServices}
          onChange={(event) => setValues((previous) => ({ ...previous, firstYearHomeServices: event.target.checked }))}
          className="mt-1 h-6 w-6 shrink-0 accent-ink"
        />
        <span>
          C’est la première année où nous employons quelqu’un à domicile
          <span className="block font-body-sm text-body-sm text-mute">Le plafond est alors plus élevé.</span>
        </span>
      </label>
      {submitError && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {submitError}
        </p>
      )}
      <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
        {saving ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>
    </form>
  );
}
