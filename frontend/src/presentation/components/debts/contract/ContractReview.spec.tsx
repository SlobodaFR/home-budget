import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseExtractionResult } from '../../../../domain/debt-extraction';
import { rawExtractedField, rawExtractionResult } from '../../../../test/fixtures';
import { ConfidenceBadge } from './ConfidenceBadge';
import { ContractReview } from './ContractReview';
import { PrefillMark } from './PrefillMark';

function setup(raw: Record<string, unknown> = rawExtractionResult()) {
  const result = parseExtractionResult(raw);
  if (!result) {
    throw new Error('résultat illisible');
  }
  const onApply = vi.fn<ComponentProps<typeof ContractReview>['onApply']>();
  const onCancel = vi.fn<() => void>();
  render(<ContractReview result={result} onApply={onApply} onCancel={onCancel} />);
  return { onApply, onCancel };
}

describe('ContractReview', () => {
  it('hands over only the checked fields', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /Durée initiale/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Taux annuel/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Préremplir le formulaire' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].map((item: { field: string }) => item.field)).toEqual(['lender', 'principalCents', 'annualRatePercent']);
  });

  it('hands over nothing when everything is unchecked, and the button is then disabled', () => {
    const { onApply } = setup();
    for (const box of screen.getAllByRole('checkbox')) {
      if ((box as HTMLInputElement).checked) {
        fireEvent.click(box);
      }
    }
    expect(screen.getByRole('button', { name: 'Préremplir le formulaire' })).toBeDisabled();
    expect(screen.getByText('0 information cochée sur 5.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Préremplir le formulaire' }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('cancels', () => {
    const { onCancel, onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler et saisir à la main' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('describes each checkbox by the confidence badge, so it is read aloud', () => {
    setup();
    const box = screen.getByRole('checkbox', { name: /Taux annuel/ });
    expect(box).toHaveAccessibleDescription('À vérifier');
    expect(screen.getByRole('checkbox', { name: /Prêteur/ })).toHaveAccessibleDescription('Sûr');
    expect(screen.getByRole('checkbox', { name: /Mensualité/ })).toHaveAccessibleDescription('Douteux');
  });

  it('shows the excerpt as plain text, never as markup', () => {
    const hostile = '<img src=x onerror="alert(1)"> <b>gras</b>';
    setup({ ...rawExtractionResult(), fields: [rawExtractedField('lender', 'Banque', 'HIGH', { snippet: hostile })] });
    const excerpt = screen.getByText(/D’après :/);
    expect(excerpt.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(excerpt.querySelector('img')).toBeNull();
    expect(excerpt.querySelector('b')).toBeNull();
  });

  it('keeps the excerpt folded and gives it a large tap target', () => {
    setup();
    const lender = screen.getByRole('checkbox', { name: /Prêteur/ }).closest('li') as HTMLElement;
    const details = lender.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(lender).getByText('Voir l’extrait du contrat').className).toContain('min-h-[44px]');
  });

  it('shows nothing about the page when the server gave none', () => {
    setup({ ...rawExtractionResult(), fields: [rawExtractedField('lender', 'Banque', 'HIGH', { page: null, snippet: null })] });
    expect(screen.queryByText(/page \d/)).not.toBeInTheDocument();
    expect(screen.queryByText('Voir l’extrait du contrat')).not.toBeInTheDocument();
  });

  it('does not say the text came from the PDF layer when the source is unknown', () => {
    setup({ ...rawExtractionResult(), source: 'AUTRE' });
    expect(screen.queryByText(/Le texte a été lu directement/)).not.toBeInTheDocument();
    expect(screen.queryByText(/reconnaissance de caractères : une lecture/)).not.toBeInTheDocument();
  });
});

describe('ConfidenceBadge', () => {
  it.each([
    ['HIGH', 'Sûr'],
    ['MEDIUM', 'À vérifier'],
    ['LOW', 'Douteux'],
  ] as const)('writes %s in words and with an icon', (confidence, label) => {
    const { container } = render(<ConfidenceBadge confidence={confidence} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('PrefillMark', () => {
  it('shows nothing without a mark, the plain text for a sure value, and a warning for a doubtful one', () => {
    const { container, rerender } = render(<PrefillMark />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PrefillMark confidence="HIGH" />);
    expect(screen.getByText('Prérempli depuis le contrat : à vérifier')).toBeInTheDocument();
    rerender(<PrefillMark confidence="LOW" />);
    expect(screen.getByText('Prérempli depuis le contrat : à vérifier, lecture peu sûre')).toBeInTheDocument();
  });
});
