import { pseudonymize } from './pseudonymize';

describe('pseudonymize', () => {
  it('should give a stable 16-hex pseudonym, case and space insensitive', () => {
    const a = pseudonymize('Thomas', 's'.repeat(32));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudonymize('  thomas ', 's'.repeat(32))).toBe(a);
  });

  it('should depend on the secret and never contain the value', () => {
    const a = pseudonymize('Thomas', 's'.repeat(32));
    expect(pseudonymize('Thomas', 't'.repeat(32))).not.toBe(a);
    expect(a.toLowerCase()).not.toContain('thomas');
  });
});
