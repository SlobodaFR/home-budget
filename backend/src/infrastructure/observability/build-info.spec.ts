import { buildInfo } from './build-info';

describe('buildInfo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the version and commit baked into the image', () => {
    vi.stubEnv('APP_VERSION', '1.4.2');
    vi.stubEnv('APP_COMMIT', 'a'.repeat(40));

    expect(buildInfo()).toEqual({ version: '1.4.2', commit: 'a'.repeat(40) });
  });

  it("is 'dev' when not built by CI (unset or blank)", () => {
    vi.stubEnv('APP_VERSION', '');
    vi.stubEnv('APP_COMMIT', '  ');

    expect(buildInfo()).toEqual({ version: 'dev', commit: 'dev' });
  });
});
