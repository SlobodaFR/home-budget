import { FormEvent, useRef, useState } from 'react';
import { Account, selectableAccounts } from '../../../domain/account';
import {
  buildProjectPayload,
  emptyProjectForm,
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_KIND_LABEL,
  Project,
  ProjectFormErrors,
  ProjectPayload,
  projectToForm,
  SELECTABLE_KINDS,
} from '../../../domain/project';
import { applyTemplate, PROJECT_TEMPLATES } from '../../../domain/project-templates';
import { AccountSelect } from '../AccountSelect';
import { BottomSheet } from '../BottomSheet';
import { ChevronLeftIcon } from '../Icons';
import { buttonPrimary, inputClass, labelClass } from '../ui';
import { KIND_ICON } from './project-style';

interface Props {
  editing: Project | null;
  accounts?: Account[];
  onClose: () => void;
  onSubmit: (payload: ProjectPayload) => Promise<void>;
  now?: () => Date;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="mt-1 font-body-sm text-body-sm text-error">
      {message}
    </p>
  ) : null;
}

function EuroInput({ id, value, onChange, invalid, describedBy, placeholder }: { id: string; value: string; onChange: (value: string) => void; invalid: boolean; describedBy?: string; placeholder: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`${inputClass} tabular pr-10 text-right`}
      />
      <span className="pointer-events-none absolute right-gutter top-1/2 -translate-y-1/2 text-mute">€</span>
    </div>
  );
}

export function ProjectForm({ editing, accounts = [], onClose, onSubmit, now = () => new Date() }: Props) {
  const [step, setStep] = useState<'template' | 'form'>(editing ? 'form' : 'template');
  const [values, setValues] = useState(() => (editing ? projectToForm(editing) : emptyProjectForm(now())));
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((previous) => ({ ...previous, [key]: value }));

  const kinds = SELECTABLE_KINDS.includes(values.kind) ? SELECTABLE_KINDS : [values.kind, ...SELECTABLE_KINDS];

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const result = buildProjectPayload(values, { accountSelectable: selectableAccounts(accounts, values.accountId || null).length > 0 });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitError(null);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'L’enregistrement a échoué.');
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (step === 'template') {
    return (
      <BottomSheet title="Nouveau projet" onClose={onClose}>
        <p className="mb-md font-body-md text-body-md">Quel est votre projet ? Choisissez un point de départ, vous pourrez tout modifier ensuite.</p>
        <ul className="grid grid-cols-1 gap-sm min-[420px]:grid-cols-2">
          {PROJECT_TEMPLATES.map((template) => {
            const Icon = KIND_ICON[template.kind];
            return (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => {
                    setValues((previous) => applyTemplate(previous, template));
                    setStep('form');
                  }}
                  className="flex min-h-[64px] w-full items-center gap-md rounded border-2 border-hairline bg-white p-md text-left hover:bg-soft-cloud"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-soft-cloud">
                    <Icon width={22} height={22} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-body-md text-body-md font-semibold">{template.label}</span>
                    <span className="block font-body-sm text-body-sm text-mute">{template.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title={editing ? 'Modifier le projet' : 'Nouveau projet'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-lg">
        {!editing && (
          <button
            type="button"
            onClick={() => setStep('template')}
            className="-ml-2 inline-flex min-h-[44px] items-center gap-1 self-start px-2 font-body-sm text-body-sm font-semibold"
          >
            <ChevronLeftIcon width={18} height={18} />
            Changer de modèle
          </button>
        )}

        <div>
          <label htmlFor="project-name" className={labelClass}>
            Nom du projet
          </label>
          <input
            id="project-name"
            type="text"
            maxLength={MAX_PROJECT_NAME_LENGTH}
            autoComplete="off"
            placeholder="Vacances été 2027"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'project-name-error' : undefined}
            className={inputClass}
          />
          <FieldError id="project-name-error" message={errors.name} />
        </div>

        <div role="group" aria-label="Type de projet">
          <span className={labelClass}>Type</span>
          <div className="grid grid-cols-2 gap-sm min-[420px]:grid-cols-3">
            {kinds.map((kind) => {
              const Icon = KIND_ICON[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={values.kind === kind}
                  onClick={() => set('kind', kind)}
                  className={`flex min-h-[48px] items-center justify-center gap-1 rounded-full border-2 px-sm font-button-md text-body-sm font-semibold leading-tight ${
                    values.kind === kind ? 'border-ink bg-ink text-surface' : 'border-hairline bg-white text-ink'
                  }`}
                >
                  <Icon width={18} height={18} className="shrink-0" />
                  {PROJECT_KIND_LABEL[kind]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="project-target" className={labelClass}>
            Somme à atteindre
          </label>
          <EuroInput
            id="project-target"
            value={values.target}
            onChange={(value) => set('target', value)}
            invalid={Boolean(errors.target)}
            describedBy={errors.target ? 'project-target-error' : undefined}
            placeholder="3 000"
          />
          <FieldError id="project-target-error" message={errors.target} />
        </div>

        <div>
          <label htmlFor="project-target-date" className={labelClass}>
            Échéance
          </label>
          <input
            id="project-target-date"
            type="date"
            value={values.targetDate}
            onChange={(event) => set('targetDate', event.target.value)}
            aria-invalid={errors.targetDate ? true : undefined}
            aria-describedby={errors.targetDate ? 'project-target-date-error' : 'project-target-date-hint'}
            className={inputClass}
          />
          <p id="project-target-date-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            La date à laquelle vous aurez besoin de l’argent.
          </p>
          <FieldError id="project-target-date-error" message={errors.targetDate} />
        </div>

        <div>
          <label htmlFor="project-start" className={labelClass}>
            Déjà épargné au départ
          </label>
          <EuroInput
            id="project-start"
            value={values.start}
            onChange={(value) => set('start', value)}
            invalid={Boolean(errors.start)}
            describedBy={errors.start ? 'project-start-error' : 'project-start-hint'}
            placeholder="0"
          />
          <p id="project-start-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Ce que vous avez déjà mis de côté pour ce projet. Laissez vide si vous partez de zéro.
          </p>
          <FieldError id="project-start-error" message={errors.start} />
        </div>

        <div>
          <label htmlFor="project-start-date" className={labelClass}>
            Date de départ
          </label>
          <input
            id="project-start-date"
            type="date"
            value={values.startDate}
            onChange={(event) => set('startDate', event.target.value)}
            aria-invalid={errors.startDate ? true : undefined}
            aria-describedby={errors.startDate ? 'project-start-date-error' : 'project-start-date-hint'}
            className={inputClass}
          />
          <p id="project-start-date-hint" className="mt-1 font-body-sm text-body-sm text-mute">
            Le jour où vous commencez (en général aujourd’hui) : on s’en sert pour savoir si vous êtes dans le rythme.
          </p>
          <FieldError id="project-start-date-error" message={errors.startDate} />
        </div>

        <AccountSelect
          id="project-account"
          accounts={accounts}
          value={values.accountId || null}
          onChange={(accountId) => set('accountId', accountId ?? '')}
          hint="Le livret où l’argent de ce projet est mis de côté, si vous en avez un."
        />

        {submitError && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {submitError}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full`}>
          {submitting ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le projet'}
        </button>
      </form>
    </BottomSheet>
  );
}
