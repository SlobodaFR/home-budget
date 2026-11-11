import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CardGrid, PageIntro, TwoColumns } from './PageLayout';

describe('PageIntro', () => {
  it('renders the title as an h2 (the screen title is the h1 of the page header), kept for screen readers on desktop', () => {
    render(
      <MemoryRouter>
        <PageIntro title="Comptes communs" description="Où circule l’argent." />
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 2, name: 'Comptes communs' });
    expect(heading.className).toContain('lg:sr-only');
    expect(screen.getByText('Où circule l’argent.').className).toContain('text-mute');
  });

  it('shows a back link on mobile and tablet only (the side bar replaces it on desktop)', () => {
    render(
      <MemoryRouter>
        <PageIntro title="Projets" back={{ to: '/', label: 'Accueil' }} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Accueil' });
    expect(link).toHaveAttribute('href', '/');
    expect(link.className).toContain('lg:hidden');
    expect(link.className).toContain('min-h-[44px]');
  });

  it('has no back link and no description when none is given', () => {
    render(
      <MemoryRouter>
        <PageIntro title="Plan commun" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('limits the line length of the description on desktop', () => {
    const { container } = render(
      <MemoryRouter>
        <PageIntro title="Plan" description="Un texte" />
      </MemoryRouter>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('lg:max-w-[75ch]');
  });
});

describe('CardGrid', () => {
  it('is one column on mobile, two from the tablet and three on large screens when asked', () => {
    render(
      <CardGrid columns={3} label="Mes cartes">
        <li>Une</li>
        <li>Deux</li>
      </CardGrid>,
    );
    const list = screen.getByRole('list', { name: 'Mes cartes' });
    expect(list.className).toContain('grid-cols-1');
    expect(list.className).toContain('md:grid-cols-2');
    expect(list.className).toContain('xl:grid-cols-3');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });

  it('stays at two columns by default and lets a lone card take the full width on request', () => {
    const { rerender } = render(
      <CardGrid label="Cartes">
        <li>Une</li>
      </CardGrid>,
    );
    expect(screen.getByRole('list').className).not.toContain('xl:grid-cols-3');
    expect(screen.getByRole('list').className).not.toContain('only-child');
    rerender(
      <CardGrid label="Cartes" fullWidthWhenAlone>
        <li>Une</li>
      </CardGrid>,
    );
    expect(screen.getByRole('list').className).toContain('only-child');
  });
});

describe('TwoColumns', () => {
  it('keeps the left column first in the DOM, so the reading order on mobile is the same as on desktop', () => {
    const { container } = render(<TwoColumns left={<p>Gauche</p>} right={<p>Droite</p>} />);
    const columns = Array.from((container.firstChild as HTMLElement).children);
    expect(columns).toHaveLength(2);
    expect(within(columns[0] as HTMLElement).getByText('Gauche')).toBeInTheDocument();
    expect(within(columns[1] as HTMLElement).getByText('Droite')).toBeInTheDocument();
  });

  it('is a single column until the chosen breakpoint', () => {
    const { container, rerender } = render(<TwoColumns left={<p>G</p>} right={<p>D</p>} />);
    expect((container.firstChild as HTMLElement).className).toContain('flex-col');
    expect((container.firstChild as HTMLElement).className).toContain('xl:grid-cols-2');
    rerender(<TwoColumns from="md" left={<p>G</p>} right={<p>D</p>} />);
    expect((container.firstChild as HTMLElement).className).toContain('md:grid-cols-2');
    rerender(<TwoColumns from="lg" ratio="aside" left={<p>G</p>} right={<p>D</p>} />);
    expect((container.firstChild as HTMLElement).className).toContain('lg:grid-cols-[minmax(0,1fr)_340px]');
  });
});
