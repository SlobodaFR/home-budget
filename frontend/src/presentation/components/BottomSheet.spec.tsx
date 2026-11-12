import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

function Host({ onClose = vi.fn<() => void>() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <button type="button">Autre bouton</button>
      {open && (
        <BottomSheet
          title="Ma feuille"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <label>
            Nom <input />
          </label>
          <button type="button">Valider</button>
        </BottomSheet>
      )}
    </>
  );
}

describe('BottomSheet (feuille du bas sur mobile, fenêtre modale dès 768 px)', () => {
  it('is a modal dialog named by its title', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Ma feuille' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Ma feuille' })).toBeInTheDocument();
  });

  it('is a bottom sheet by default and a centred, rounded modal with its own scroll from `md`', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('rounded-t-lg');
    expect(dialog.className).toContain('overflow-y-auto');
    expect(dialog.className).toContain('md:rounded-lg');
    expect(dialog.className).toContain('md:max-w-[640px]');
    expect(dialog.className).toContain('md:max-h-[88dvh]');
    expect(dialog.parentElement?.className).toContain('items-end');
    expect(dialog.parentElement?.className).toContain('md:items-center');
    expect(screen.getByTestId('sheet-backdrop').className).toContain('bg-ink/40');
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(<Host onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a click on the dimmed background, but not on a click inside the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    render(<Host onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with the close button', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves the focus into the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('traps the focus: Tab and Shift+Tab loop inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const close = screen.getByRole('button', { name: 'Fermer' });
    const input = screen.getByLabelText('Nom');
    const validate = screen.getByRole('button', { name: 'Valider' });

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab();
    expect(validate).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(validate).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Autre bouton' })).not.toHaveFocus();
  });

  it('pulls the focus back when something outside the dialog receives it', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    screen.getByRole('button', { name: 'Autre bouton' }).focus();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('gives the focus back to the element that opened it', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('does not take the focus away from a field the content focuses itself (autoFocus), and still restores the trigger', async () => {
    const user = userEvent.setup();
    function AutoFocusHost() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Ouvrir
          </button>
          {open && (
            <BottomSheet title="Saisie" onClose={() => setOpen(false)}>
              <input aria-label="Montant" autoFocus />
            </BottomSheet>
          )}
        </>
      );
    }
    render(<AutoFocusHost />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(trigger);
    expect(screen.getByLabelText('Montant')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(trigger).toHaveFocus();
  });

  it('only the topmost of two stacked sheets reacts to Escape', async () => {
    const user = userEvent.setup();
    const closeBottom = vi.fn<() => void>();
    const closeTop = vi.fn<() => void>();
    render(
      <>
        <BottomSheet title="Dessous" onClose={closeBottom}>
          <button type="button">Dessous</button>
        </BottomSheet>
        <BottomSheet title="Dessus" onClose={closeTop}>
          <button type="button">Dessus</button>
        </BottomSheet>
      </>,
    );
    await user.keyboard('{Escape}');
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it('keeps the original trigger when one sheet is replaced by another (import step → form)', async () => {
    const user = userEvent.setup();
    function SwitchHost() {
      const [step, setStep] = useState<'closed' | 'one' | 'two'>('closed');
      return (
        <>
          <button type="button" onClick={() => setStep('one')}>
            Ouvrir
          </button>
          {step === 'one' && (
            <BottomSheet title="Étape 1" onClose={() => setStep('closed')}>
              <button type="button" onClick={() => setStep('two')}>
                Continuer
              </button>
            </BottomSheet>
          )}
          {step === 'two' && (
            <BottomSheet title="Étape 2" onClose={() => setStep('closed')}>
              <p>Deuxième feuille</p>
            </BottomSheet>
          )}
        </>
      );
    }
    render(<SwitchHost />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByRole('dialog', { name: 'Étape 2' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
