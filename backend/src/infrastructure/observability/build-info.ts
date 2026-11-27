/**
 * Release identity baked into the image by the build (convention harnais release-versioning):
 * APP_VERSION = X.Y.Z, APP_COMMIT = full sha. 'dev' when the image or process was not built by CI.
 */
export interface BuildInfo {
  version: string;
  commit: string;
}

const valueOf = (name: 'APP_VERSION' | 'APP_COMMIT'): string =>
  process.env[name]?.trim() || 'dev';

export const buildInfo = (): BuildInfo => ({
  version: valueOf('APP_VERSION'),
  commit: valueOf('APP_COMMIT'),
});
