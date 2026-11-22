/**
 * Port (driven side): boolean feature flags, served by home-features over OFREP.
 *
 * `codeDefault` is the behaviour shipped in the code: it applies whenever the flag has no
 * value for this environment, does not exist, or cannot be read. Never throws.
 */
export abstract class FeatureFlags {
  abstract isEnabled(key: string, codeDefault: boolean): Promise<boolean>;
}
