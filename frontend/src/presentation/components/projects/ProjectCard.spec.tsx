import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectStatus } from '../../../domain/project';
import { project } from '../../../test/fixtures';
import { ProjectCard } from './ProjectCard';
import { ProjectProgress } from './ProjectProgress';
import { ProjectStatusBadge } from './ProjectStatusBadge';

const plain = (value: string | null | undefined) => (value ?? '').replace(/[\s  ]/g, ' ');

describe('ProjectProgress', () => {
  it('is a progress bar whose value text says it all', () => {
    render(<ProjectProgress project={project()} />);
    const bar = screen.getByRole('progressbar', { name: 'Progression du projet' });
    expect(bar).toHaveAttribute('aria-valuenow', '13');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(plain(bar.getAttribute('aria-valuetext'))).toBe('13 % — 400 € sur 3 000 €');
    expect(plain(screen.getByText(/13 %/).textContent)).toBe('13 % — 400 € sur 3 000 €');
  });

  it('marks the expected progress only on request', () => {
    const { rerender } = render(<ProjectProgress project={project()} />);
    expect(screen.queryByTestId('expected-marker')).not.toBeInTheDocument();
    rerender(<ProjectProgress project={project()} showExpected />);
    expect(screen.getByTestId('expected-marker')).toHaveStyle({ left: '25%' });
  });

  it('draws a full bar for a reached project and no marker', () => {
    render(<ProjectProgress project={project({ status: 'DONE', progressPercent: 100, savedCents: 300000, expectedSavedCents: 300000 })} showExpected />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.queryByTestId('expected-marker')).not.toBeInTheDocument();
  });
});

describe('ProjectStatusBadge', () => {
  it.each<[ProjectStatus, string]>([
    ['DONE', 'Atteint'],
    ['AHEAD', 'En avance'],
    ['ON_TRACK', 'À jour'],
    ['BEHIND', 'En retard'],
    ['LATE', 'En retard sur l’échéance'],
  ])('writes the status %s in words', (status, label) => {
    render(<ProjectStatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveAttribute('data-status', status);
  });
});

describe('ProjectCard', () => {
  const renderCard = (props: Partial<Parameters<typeof ProjectCard>[0]> = {}) => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(
      <ul>
        <ProjectCard project={project()} onOpen={onOpen} onEdit={onEdit} {...props} />
      </ul>,
    );
    return { onOpen, onEdit };
  };

  it('shows name, kind, status, progress, deadline and the monthly need', () => {
    renderCard({ accountLabel: 'Livret A' });
    const card = screen.getByTestId('project-card');
    expect(card).toHaveTextContent('Vacances été 2027');
    expect(card).toHaveTextContent('Vacances · Livret A');
    expect(within(card).getByText('En retard')).toBeInTheDocument();
    expect(plain(card.textContent)).toContain('13 % — 400 € sur 3 000 €');
    expect(plain(card.textContent)).toMatch(/Échéance le 1(er)? juillet 2027 · dans 8 mois/);
    expect(plain(card.textContent)).toContain('Il faut mettre de côté 325 € par mois.');
    expect(plain(card.textContent)).toContain('Il manque 350 € par rapport au rythme prévu.');
  });

  it('names the kind for screen readers through the icon', () => {
    renderCard();
    expect(within(screen.getByTestId('project-card')).getAllByText('Vacances').length).toBeGreaterThan(0);
  });

  it('has 44 px buttons wired to open and edit', async () => {
    const { onOpen, onEdit } = renderCard();
    const open = screen.getByRole('button', { name: 'Versements de Vacances été 2027' });
    const edit = screen.getByRole('button', { name: 'Modifier Vacances été 2027' });
    expect(open.className).toContain('min-h-[44px]');
    expect(edit.className).toContain('min-h-[44px]');
    open.click();
    edit.click();
    expect(onOpen).toHaveBeenCalledWith(project());
    expect(onEdit).toHaveBeenCalledWith(project());
  });

  it('does not nag about the monthly need on an archived or reached project', () => {
    renderCard({ project: project({ archived: true }) });
    expect(screen.getByText('Archivé')).toBeInTheDocument();
    expect(screen.queryByText(/Il faut mettre de côté/)).not.toBeInTheDocument();
  });

  it('celebrates a reached project', () => {
    renderCard({ project: project({ status: 'DONE', remainingCents: 0, monthlyNeededCents: 0, progressPercent: 100, savedCents: 300000 }) });
    expect(screen.getByText('Atteint')).toBeInTheDocument();
    expect(screen.getByText(/Objectif atteint/)).toBeInTheDocument();
    expect(screen.queryByText(/par rapport au rythme/)).not.toBeInTheDocument();
  });
});
