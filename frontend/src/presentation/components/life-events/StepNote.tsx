import { FormEvent, useId, useRef, useState } from 'react';
import { MAX_STEP_NOTE_LENGTH, NOTE_PRIVACY_HINT, validateNote } from '../../../domain/life-event';
import { PencilIcon } from '../Icons';
import { buttonPrimary, buttonSecondary, inputClass, labelClass } from '../ui';

interface Props {
  note: string;
  /** Enregistre la note ; lève une `Error` dont le message est affiché : la saisie reste alors dans le champ. */
  onSave: (note: string) => Promise<void>;
}

/** La note d'une démarche (200 caractères). Rien n'est jamais effacé tant que l'enregistrement n'a pas réussi. */
export function StepNote({ note, onSave }: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const over = draft.trim().length > MAX_STEP_NOTE_LENGTH;

  const open = () => {
    setDraft(note);
    setError(null);
    setEditing(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) {
      return;
    }
    const result = validateNote(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(result.note);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'La note n’a pas pu être enregistrée. Elle reste ici : réessayez.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-col items-start gap-sm">
        {note !== '' && (
          <p className="break-words font-body-sm text-body-sm">
            <span className="font-semibold">Ma note : </span>
            {note}
          </p>
        )}
        <button type="button" onClick={open} className={`${buttonSecondary} min-h-[44px] px-lg font-body-sm text-body-sm font-semibold`}>
          <PencilIcon width={16} height={16} />
          {note === '' ? 'Ajouter une note' : 'Modifier la note'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-sm">
      <label htmlFor={`${id}-note`} className={labelClass}>
        Ma note (facultatif)
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-invalid={error || over ? true : undefined}
        aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`}
        className={`${inputClass} min-h-[88px] py-md`}
      />
      <p id={`${id}-count`} className={`tabular font-body-sm text-body-sm ${over ? 'font-semibold text-error' : 'text-mute'}`}>
        {draft.trim().length} / {MAX_STEP_NOTE_LENGTH} caractères
      </p>
      <p id={`${id}-hint`} className="font-body-sm text-body-sm text-mute">
        {NOTE_PRIVACY_HINT}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <button type="submit" disabled={saving || over} className={`${buttonPrimary} min-h-[44px] px-lg font-body-sm text-body-sm`}>
          {saving ? 'Enregistrement…' : 'Enregistrer la note'}
        </button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)} className={`${buttonSecondary} min-h-[44px] px-lg font-body-sm text-body-sm`}>
          Annuler
        </button>
      </div>
    </form>
  );
}
