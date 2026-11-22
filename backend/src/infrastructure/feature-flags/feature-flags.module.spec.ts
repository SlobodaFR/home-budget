import { Test } from '@nestjs/testing';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { FeatureFlagsModule } from './feature-flags.module';
import { OpenFeatureFeatureFlags } from './openfeature-feature-flags';

describe('FeatureFlagsModule', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('fournit le port FeatureFlags, en no-op sans FEATURES_OFREP_URL ni FEATURES_API_KEY', async () => {
    delete process.env.FEATURES_OFREP_URL;
    delete process.env.FEATURES_API_KEY;
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureFlagsModule],
    }).compile();
    const flags = moduleRef.get(FeatureFlags);
    expect(flags).toBeInstanceOf(OpenFeatureFeatureFlags);
    expect(await flags.isEnabled('un-flag', false)).toBe(false);
    expect(await flags.isEnabled('un-flag', true)).toBe(true);
  });

  it('applique le pin d’urgence lu dans process.env', async () => {
    delete process.env.FEATURES_OFREP_URL;
    delete process.env.FEATURES_API_KEY;
    process.env.FEATURES_PIN_UN_FLAG = 'true';
    const moduleRef = await Test.createTestingModule({
      imports: [FeatureFlagsModule],
    }).compile();
    expect(await moduleRef.get(FeatureFlags).isEnabled('un-flag', false)).toBe(
      true,
    );
  });
});
