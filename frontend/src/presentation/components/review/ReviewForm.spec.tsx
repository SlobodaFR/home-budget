import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_REVIEW_ANSWER_LENGTH } from '../../../domain/review';
import { review } from '../../../test/fixtures';
import { ReviewForm } from './ReviewForm';

const setup = (overrides: Partial<Parameters<typeof ReviewForm>[0]> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onChange = vi.fn();
  const base = review({ month: '2026-10' });
  render(<ReviewForm review={base} initialValues={base.answers} offline={false} onChange={onChange} onSave={onSave} {...overrides} />);
  return { onSave, onChange, user: userEvent.setup() };
};

describe('ReviewForm', () => {
  it('limits each answer to 500 characters and counts them', async () => {
    const { user } = setup();
    const field = screen.getByLabelText('Qu’est-ce qui m’a surpris ?');
    expect(field).toHaveAttribute('maxlength', String(MAX_REVIEW_ANSWER_LENGTH));
    await user.click(field);
    await user.paste('a'.repeat(600));
    expect(screen.getByText('500 / 500')).toBeInTheDocument();
  });

  it('announces the counter only when the limit gets close', async () => {
    const { user } = setup();
    const field = screen.getByLabelText('Qu’est-ce qui a bien marché ?');
    await user.type(field, 'abc');
    expect(screen.getByText('3 / 500')).toHaveAttribute('aria-live', 'off');
    await user.click(field);
    await user.paste('a'.repeat(460));
    expect(screen.getByText('463 / 500')).toHaveAttribute('aria-live', 'polite');
  });

  it('reports every change so the page can keep the text', async () => {
    const { user, onChange } = setup();
    await user.type(screen.getByLabelText('Qu’est-ce qui a bien marché ?'), 'ok');
    expect(onChange).toHaveBeenLastCalledWith({ wentWell: 'ok', surprise: '', decision: '' });
  });

  it('clears a field error as soon as you start typing in it', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('décision');
    await user.type(screen.getByLabelText(/Quelle décision/), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the message of a failed save and keeps every field as typed', async () => {
    const { user } = setup({ onSave: vi.fn().mockRejectedValue(new Error('Pas de connexion : votre texte est conservé sur cet écran.')) });
    await user.type(screen.getByLabelText(/Quelle décision/), 'Une liste');
    await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pas de connexion');
    expect(screen.getByLabelText(/Quelle décision/)).toHaveValue('Une liste');
    expect(screen.getByRole('button', { name: 'Terminer la revue' })).toBeEnabled();
  });

  it('shows the offline note only when the browser is offline', () => {
    setup({ offline: true });
    expect(screen.getByRole('status')).toHaveTextContent('Vous êtes hors ligne');
  });

  it('trims the answers it sends', async () => {
    const { user, onSave } = setup();
    await user.type(screen.getByLabelText(/Quelle décision/), '  Une liste  ');
    await user.click(screen.getByRole('button', { name: 'Terminer la revue' }));
    expect(onSave).toHaveBeenCalledWith({ answers: { wentWell: '', surprise: '', decision: 'Une liste' }, complete: true });
    expect(await screen.findByLabelText(/Quelle décision/)).toHaveValue('Une liste');
  });
});
