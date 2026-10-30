import { FormEvent, useState } from 'react';
import { centsToInputValue, parseAmountToCents } from '../../domain/money';
import { buttonPrimary, inputClass } from './ui';

interface Props {
  currentCents: number | null;
  onSave: (cents: number | null) => Promise<void>;
}

export function IncomeForm({ currentCents, onSave }: Props) {
  const [value, setValue] = useState(currentCents === null ? '' : centsToInputValue(currentCents));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cents = value.trim() === '' ? null : parseAmountToCents(value);
    if (value.trim() !== '' && cents === null) {
      setError('Revenu invalide : utilisez des chiffres (ex. 2 300 ou 2300,50).');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(cents);
    } catch {
      setError('Enregistrement impossible, réessayez.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-md">
      <div>
        <label htmlFor="my-income" className="sr-only">
          Revenu net mensuel
        </label>
        <div className="relative">
          <input
            id="my-income"
            className={`${inputClass} tabular pr-10 text-right`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Non renseigné"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
          <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
        </div>
        {error && (
          <p role="alert" className="mt-1 font-body-sm text-body-sm text-error">
            {error}
          </p>
        )}
      </div>
      <button type="submit" disabled={saving} className={buttonPrimary}>
        {saving ? 'Enregistrement…' : 'Enregistrer mon revenu'}
      </button>
    </form>
  );
}
