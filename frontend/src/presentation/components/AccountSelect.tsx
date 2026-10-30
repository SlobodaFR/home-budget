import { Account, selectableAccounts } from '../../domain/account';
import { inputClass, labelClass } from './ui';

interface Props {
  id: string;
  accounts: Account[];
  /** Identifiant du compte choisi, `null` pour « Aucun ». */
  value: string | null;
  onChange: (accountId: string | null) => void;
  label?: string;
  hint?: string;
}

/** Sélecteur de compte facultatif : absent tant que l'espace n'a aucun compte utilisable. */
export function AccountSelect({ id, accounts, value, onChange, label = 'Compte (facultatif)', hint }: Props) {
  const options = selectableAccounts(accounts, value);
  if (options.length === 0) {
    return null;
  }
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={inputClass}
      >
        <option value="">Aucun</option>
        {options.map((account) => (
          <option key={account.id} value={account.id}>
            {account.archived ? `${account.name} (archivé)` : account.name}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 font-body-sm text-body-sm text-mute">
          {hint}
        </p>
      )}
    </div>
  );
}
