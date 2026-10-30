import { ReactNode, useEffect } from 'react';
import { CloseIcon } from './Icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ title, onClose, children }: Props) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="animate-fade-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-up relative max-h-[94dvh] w-full max-w-[560px] overflow-y-auto rounded-t-lg bg-surface px-margin-mobile pb-[calc(env(safe-area-inset-bottom)+20px)] pt-lg shadow-2xl"
      >
        <div className="mb-md flex items-center justify-between">
          <h2 className="font-heading-lg text-heading-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-soft-cloud"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
