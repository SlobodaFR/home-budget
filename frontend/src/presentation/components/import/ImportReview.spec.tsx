import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportPreview } from '../../../domain/statement-import';
import { previewRow } from '../../../test/fixtures';
import { ImportReview } from './ImportReview';

function setup(preview: ImportPreview, props: { submitting?: boolean; error?: string | null } = {}) {
  const onSubmit = vi.fn();
  const onBack = vi.fn();
  render(<ImportReview preview={preview} submitting={props.submitting ?? false} error={props.error ?? null} onSubmit={onSubmit} onBack={onBack} />);
  return { onSubmit, onBack, user: userEvent.setup() };
}

const preview: ImportPreview = {
  rows: [
    previewRow(0, { label: 'PRLV LOYER OCTOBRE', amountCents: -110000, target: 'FIXE' }),
    previewRow(1, { label: 'VIR SALAIRE', amountCents: 250000, target: 'INCOME' }),
    previewRow(2, { label: 'VIR INTERNE EPARGNE', amountCents: -20000, target: 'IGNORE' }),
    previewRow(3, { label: 'CB BOULANGERIE PAUL 02/10', amountCents: -450 }),
    previewRow(4, { label: 'CB BOULANGERIE PAUL 09/10', amountCents: -380 }),
    previewRow(5, { label: 'CB CINEMA PATHE', amountCents: -1500 }),
    previewRow(6, { label: 'PRLV EDF DEJA VU', amountCents: -7000, target: 'FIXE', duplicate: true }),
  ],
  skipped: [{ line: 1, reason: 'en-tête' }],
  truncated: false,
};

const radio = (rowLabel: string, name: string) =>
  within(screen.getByRole('radiogroup', { name: `Classement de ${rowLabel}` })).getByRole('radio', { name });

const importButton = () => screen.getByRole('button', { name: /^Importer \d+ opération/ });

describe('ImportReview', () => {
  it('orders the groups: to classify, classified, then collapsed duplicates', () => {
    setup(preview);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings[1]).toMatch(/^À classer/);
    expect(headings[2]).toMatch(/^Classées \(3\)/);
    expect(headings[3]).toMatch(/^Déjà importées \(1\)/);
    expect(screen.queryByText('PRLV EDF DEJA VU')).not.toBeInTheDocument();
  });

  it('preselects the server suggestion, income for positive amounts and nothing for unknown rows', () => {
    setup(preview);
    expect(radio('PRLV LOYER OCTOBRE', 'Fixe')).toBeChecked();
    expect(radio('VIR SALAIRE', 'Revenu')).toBeChecked();
    expect(radio('VIR INTERNE EPARGNE', 'Ignorer')).toBeChecked();
    for (const name of ['Fixe', 'Courant', 'Plaisir', 'Épargne', 'Revenu', 'Ignorer']) {
      expect(radio('CB CINEMA PATHE', name)).not.toBeChecked();
    }
  });

  it('ignores duplicates by default with a badge, and lets the user change that', async () => {
    const { user } = setup(preview);
    await user.click(screen.getByRole('button', { name: /Déjà importées/ }));
    expect(screen.getByText('Déjà importée')).toBeInTheDocument();
    expect(radio('PRLV EDF DEJA VU', 'Ignorer')).toBeChecked();
    await user.click(radio('PRLV EDF DEJA VU', 'Fixe'));
    expect(radio('PRLV EDF DEJA VU', 'Fixe')).toBeChecked();
  });

  it('blocks the validation while a row is still to classify, and counts them', async () => {
    const { onSubmit, user } = setup(preview);
    expect(screen.getByRole('button', { name: '3 à classer' })).toBeInTheDocument();
    expect(importButton()).toBeDisabled();

    await user.click(radio('CB BOULANGERIE PAUL 02/10', 'Courant'));
    await user.click(radio('CB BOULANGERIE PAUL 09/10', 'Courant'));
    expect(screen.getByRole('button', { name: '1 à classer' })).toBeInTheDocument();
    expect(importButton()).toBeDisabled();

    await user.click(radio('CB CINEMA PATHE', 'Ignorer'));
    expect(screen.getByText('Tout est classé')).toBeInTheDocument();
    expect(importButton()).toBeEnabled();
    await user.click(importButton());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sends the items with positive amounts and leaves out ignored rows', async () => {
    const { onSubmit, user } = setup(preview);
    await user.click(radio('CB BOULANGERIE PAUL 02/10', 'Courant'));
    await user.click(radio('CB BOULANGERIE PAUL 09/10', 'Courant'));
    await user.click(radio('CB CINEMA PATHE', 'Plaisir'));
    await user.click(importButton());

    const { items, learned } = onSubmit.mock.calls[0][0];
    expect(learned).toEqual([]);
    expect(items).toEqual([
      { kind: 'EXPENSE', bloc: 'FIXE', label: 'PRLV LOYER OCTOBRE', amountCents: 110000, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'INCOME', label: 'VIR SALAIRE', amountCents: 250000, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'EXPENSE', bloc: 'COURANT', label: 'CB BOULANGERIE PAUL 02/10', amountCents: 450, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'EXPENSE', bloc: 'COURANT', label: 'CB BOULANGERIE PAUL 09/10', amountCents: 380, date: '2026-10-02T00:00:00.000Z' },
      { kind: 'EXPENSE', bloc: 'PLAISIR', label: 'CB CINEMA PATHE', amountCents: 1500, date: '2026-10-02T00:00:00.000Z' },
    ]);
  });

  it('shows live totals and the number of operations to create', async () => {
    const { user } = setup(preview);
    const totals = screen.getByRole('region', { name: 'Totaux de l’import' });
    expect(within(totals).getByText(/2\s?500,00\s€/)).toBeInTheDocument();
    expect(within(totals).getByText('2 opérations seront créées.')).toBeInTheDocument();
    await user.click(radio('CB CINEMA PATHE', 'Plaisir'));
    expect(within(totals).getByText('3 opérations seront créées.')).toBeInTheDocument();
    expect(within(totals).getByText(/15,00\s€/)).toBeInTheDocument();
  });

  it('classifies all similar rows at once', async () => {
    const { user } = setup(preview);
    expect(screen.queryByRole('button', { name: /lignes similaires/ })).not.toBeInTheDocument();
    await user.click(radio('CB BOULANGERIE PAUL 02/10', 'Courant'));
    await user.click(screen.getByRole('button', { name: 'Classer toutes les lignes similaires (1)' }));
    expect(radio('CB BOULANGERIE PAUL 09/10', 'Courant')).toBeChecked();
    expect(screen.queryByRole('button', { name: /lignes similaires/ })).not.toBeInTheDocument();
  });

  it('offers to remember a manual classification with an editable keyword', async () => {
    const { onSubmit, user } = setup(preview);
    expect(screen.queryByLabelText('Retenir pour la prochaine fois')).not.toBeInTheDocument();
    await user.click(radio('CB CINEMA PATHE', 'Plaisir'));
    await user.click(radio('CB BOULANGERIE PAUL 02/10', 'Courant'));
    await user.click(radio('CB BOULANGERIE PAUL 09/10', 'Courant'));

    const card = screen.getByRole('radiogroup', { name: 'Classement de CB CINEMA PATHE' }).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('checkbox', { name: 'Retenir pour la prochaine fois' }));
    const keyword = within(card).getByRole('textbox');
    expect(keyword).toHaveValue('cinema');
    await user.clear(keyword);
    await user.type(keyword, 'pathe cinema');
    await user.click(importButton());

    expect(onSubmit.mock.calls[0][0].learned).toEqual([{ keyword: 'pathe cinema', target: 'PLAISIR' }]);
  });

  it('does not propose to remember a suggestion the server already made', () => {
    setup(preview);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows the skipped lines on demand and the truncation notice', async () => {
    const { user } = setup({ ...preview, truncated: true });
    expect(screen.getByText(/Relevé tronqué/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '1 ligne non lue' }));
    expect(screen.getByText('Ligne 1 : en-tête')).toBeInTheDocument();
  });

  it('explains when no row was recognised', async () => {
    const { onBack, user } = setup({ rows: [], skipped: [{ line: 1, reason: 'en-tête' }], truncated: false });
    expect(screen.getByText(/Aucune ligne reconnue/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choisir un autre relevé' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('disables the button while submitting and shows the error', () => {
    setup(preview, { submitting: true, error: 'L’import a échoué' });
    expect(screen.getByRole('button', { name: 'Import en cours…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('L’import a échoué');
  });

  it('refuses more than 500 operations', () => {
    const rows = Array.from({ length: 501 }, (_, index) => previewRow(index, { target: 'COURANT' }));
    setup({ rows, skipped: [], truncated: false });
    expect(screen.getByRole('alert')).toHaveTextContent(/limité à 500/);
    expect(importButton()).toBeDisabled();
  });

  it('moves the selection with the arrow keys', async () => {
    const { user } = setup(preview);
    radio('PRLV LOYER OCTOBRE', 'Fixe').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('PRLV LOYER OCTOBRE', 'Courant')).toBeChecked();
    expect(radio('PRLV LOYER OCTOBRE', 'Courant')).toHaveFocus();
  });

  it('renders a large statement', () => {
    const rows = Array.from({ length: 300 }, (_, index) => previewRow(index, index % 3 === 0 ? { target: 'COURANT' } : {}));
    setup({ rows, skipped: [], truncated: false });
    expect(screen.getByRole('button', { name: '200 à classer' })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(300);
  });
});
