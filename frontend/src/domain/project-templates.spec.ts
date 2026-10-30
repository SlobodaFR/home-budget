import { describe, expect, it } from 'vitest';
import { emptyProjectForm, PROJECT_KINDS } from './project';
import { applyTemplate, PROJECT_TEMPLATES } from './project-templates';

const NOW = new Date(2026, 9, 30, 9, 0, 0);

describe('project templates', () => {
  it('offers the five starting points in order', () => {
    expect(PROJECT_TEMPLATES.map((template) => template.label)).toEqual(['Naissance', 'Vacances', 'Voiture', 'Travaux', 'Autre']);
  });

  it('only uses known kinds and sensible horizons', () => {
    for (const template of PROJECT_TEMPLATES) {
      expect(PROJECT_KINDS).toContain(template.kind);
      expect(template.horizonMonths).toBeGreaterThanOrEqual(6);
      expect(template.horizonMonths).toBeLessThanOrEqual(24);
    }
  });

  it('prefills name, kind and due date from the start date, without any amount', () => {
    const baby = PROJECT_TEMPLATES[0];
    expect(applyTemplate(emptyProjectForm(NOW), baby)).toEqual({
      name: 'Arrivée du bébé',
      kind: 'BABY',
      target: '',
      targetDate: '2027-07-30',
      start: '',
      startDate: '2026-10-30',
      accountId: '',
    });
  });

  it('keeps what the user already typed for the amounts and the account', () => {
    const typed = { ...emptyProjectForm(NOW), target: '3000', start: '500', accountId: 'acc-1' };
    const result = applyTemplate(typed, PROJECT_TEMPLATES[2]);
    expect(result).toMatchObject({ target: '3000', start: '500', accountId: 'acc-1', kind: 'PURCHASE', name: 'Voiture', targetDate: '2028-04-30' });
  });

  it('leaves the name empty for « Autre » so nothing is imposed', () => {
    expect(applyTemplate({ ...emptyProjectForm(NOW), name: 'Ancien' }, PROJECT_TEMPLATES[4])).toMatchObject({ name: '', kind: 'OTHER', targetDate: '2027-10-30' });
  });

  it('can switch from one template to another', () => {
    const first = applyTemplate(emptyProjectForm(NOW), PROJECT_TEMPLATES[0]);
    const second = applyTemplate(first, PROJECT_TEMPLATES[1]);
    expect(second).toMatchObject({ kind: 'HOLIDAY', name: 'Vacances', targetDate: '2027-06-30' });
  });
});
