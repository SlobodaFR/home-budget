import { ReactNode, useEffect, useRef, useState } from 'react';
import { CloseIcon } from './Icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Les feuilles ouvertes, de la plus ancienne à la plus récente : seule la dernière réagit à Échap et garde le focus. */
const openSheets: symbol[] = [];

/**
 * L'élément déclencheur de la feuille qui vient de se fermer, le temps d'un tour : si une autre feuille s'ouvre à sa place
 * (par exemple de l'étape « importer un contrat » au formulaire), c'est toujours vers lui que le focus reviendra à la fin.
 */
let carriedTrigger: HTMLElement | null = null;

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest('[hidden], [inert]'),
  );
}

/**
 * Une feuille qui monte du bas sur mobile et une fenêtre modale centrée à partir de 768 px (`md`) : le même composant pour
 * tous les formulaires et détails. Dans les deux cas c'est un dialogue modal : Échap et le clic sur le fond la ferment, le focus
 * reste prisonnier à l'intérieur tant qu'elle est ouverte puis retourne à l'élément qui l'a ouverte, et le contenu défile
 * à l'intérieur quand il est trop long.
 */
export function BottomSheet({ title, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // L'élément qui avait le focus avant l'ouverture, lu pendant le rendu : un `autoFocus` du contenu le déplace dès le montage.
  const [openerAtMount] = useState<Element | null>(() =>
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const triggerRef = useRef<Element | null>(openerAtMount);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }
    const token = Symbol('sheet');
    if (carriedTrigger) {
      triggerRef.current = carriedTrigger;
      carriedTrigger = null;
    }
    openSheets.push(token);
    const isTop = () => openSheets[openSheets.length - 1] === token;

    if (!dialog.contains(document.activeElement)) {
      dialog.focus({ preventScroll: true });
    }

    const handleKey = (event: KeyboardEvent) => {
      if (!isTop()) {
        return;
      }
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const items = focusableIn(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || active === dialog || !dialog.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (
        isTop() &&
        event.target instanceof Node &&
        !dialog.contains(event.target)
      ) {
        (focusableIn(dialog)[0] ?? dialog).focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', handleFocusIn);
      const index = openSheets.indexOf(token);
      if (index >= 0) {
        openSheets.splice(index, 1);
      }
      const trigger = triggerRef.current;
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        openSheets.length === 0
      ) {
        trigger.focus({ preventScroll: true });
        carriedTrigger = trigger;
        window.setTimeout(() => {
          if (carriedTrigger === trigger) {
            carriedTrigger = null;
          }
        }, 0);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-8">
      <div
        data-testid="sheet-backdrop"
        className="animate-fade-in absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="animate-sheet-up relative max-h-[94dvh] w-full max-w-[560px] overflow-y-auto rounded-t-lg bg-surface px-margin-mobile pb-[calc(env(safe-area-inset-bottom)+20px)] pt-lg shadow-2xl outline-none md:max-h-[88dvh] md:max-w-[640px] md:animate-modal-in md:rounded-lg md:px-8 md:pb-8 md:pt-6"
      >
        <div className="mb-md flex items-center justify-between">
          <h2 className="font-heading-lg text-heading-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-soft-cloud"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
