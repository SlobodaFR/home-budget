import { SpaceKind } from '../../domain/household';
import { useSpace } from '../../application/use-space';
import { LockIcon, UsersIcon } from './Icons';

const OPTIONS: { kind: SpaceKind; label: string; caption: string }[] = [
  { kind: 'COMMON', label: 'Commun', caption: 'Visible par tout le foyer' },
  { kind: 'PERSONAL', label: 'Perso', caption: 'Visible par vous seul' },
];

export function SpaceSwitcher() {
  const { kind, setKind, hasPersonalSpace } = useSpace();
  const current = OPTIONS.find((option) => option.kind === kind) ?? OPTIONS[0];

  return (
    <div>
      <div role="group" aria-label="Espace" className="grid grid-cols-2 rounded-full bg-soft-cloud p-1">
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            aria-pressed={kind === option.kind}
            disabled={option.kind === 'PERSONAL' && !hasPersonalSpace}
            onClick={() => setKind(option.kind)}
            className={`flex min-h-[44px] items-center justify-center gap-sm rounded-full font-button-md text-body-md font-semibold transition-colors ${
              kind === option.kind ? 'bg-ink text-surface' : 'text-ink'
            }`}
          >
            {option.kind === 'COMMON' ? <UsersIcon width={18} height={18} /> : <LockIcon width={18} height={18} />}
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-center font-body-sm text-[12px] text-mute">{current.caption}</p>
    </div>
  );
}
