import { CATEGORY_LABEL, countByCategory, LifeEventDefinition } from '../../../domain/life-event';
import { pluralize } from '../../../domain/plural';
import { BabyIcon, PlusIcon } from '../Icons';
import { buttonPrimary, cardClass } from '../ui';
import { CATEGORY_ICON } from './life-event-style';

interface Props {
  /** Le catalogue, s'il est arrivé : il permet de dire concrètement ce qui sera suivi (sinon le texte reste général). */
  definition?: LifeEventDefinition;
  onAdd: () => void;
}

export function LifeEventsEmptyState({ definition, onAdd }: Props) {
  const steps = definition?.steps ?? [];
  const categories = countByCategory(steps);
  return (
    <section aria-label="À quoi servent les événements de vie" className={`${cardClass} flex flex-col gap-md`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-soft-cloud">
        <BabyIcon width={24} height={24} />
      </span>
      <h3 className="font-heading-lg text-heading-lg">À quoi servent les événements de vie&nbsp;?</h3>
      <p className="font-body-md text-body-md">
        Une naissance entraîne beaucoup de démarches, avec des délais : déclarer la naissance, prévenir la Caf, les impôts, l’employeur… On oublie vite
        quelque chose. Indiquez la date de naissance (prévue ou réelle) : <span className="font-semibold">on vous liste les démarches, avec leur échéance</span>,
        et vous les cochez au fur et à mesure.
      </p>
      {steps.length > 0 && (
        <div className="flex flex-col gap-sm">
          <p className="font-body-sm text-body-sm font-semibold">{pluralize(steps.length, 'démarche suivie', 'démarches suivies')}, chacune avec sa source officielle :</p>
          <ul className="flex flex-wrap gap-sm">
            {categories.map(({ category, count }) => {
              const Icon = CATEGORY_ICON[category];
              return (
                <li key={category} className="inline-flex items-center gap-1 rounded-full bg-soft-cloud px-md py-1 font-body-sm text-body-sm font-semibold">
                  <Icon width={14} height={14} />
                  {CATEGORY_LABEL[category]} ({count})
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="font-body-sm text-body-sm text-mute">Rien n’est envoyé à l’administration : c’est un pense-bête pour votre foyer, visible par tous ses membres.</p>
      <button type="button" onClick={onAdd} className={`${buttonPrimary} w-full`}>
        <PlusIcon width={18} height={18} />
        Ajouter une naissance
      </button>
    </section>
  );
}
