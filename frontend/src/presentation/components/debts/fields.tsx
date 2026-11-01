import { inputClass } from '../ui';

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

/** Champ de saisie d'un nombre décimal (virgule ou point) avec son unité à droite (« € » ou « % »). */
export function NumberInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
  unit = '€',
  inputMode = 'decimal',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
  unit?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputClass} tabular ${unit.length > 1 ? 'pr-16' : 'pr-10'} text-right`}
      />
      <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">{unit}</span>
    </div>
  );
}
