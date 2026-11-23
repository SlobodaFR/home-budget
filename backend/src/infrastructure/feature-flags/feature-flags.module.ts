import { Global, Module } from '@nestjs/common';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { createFeatureFlags } from './openfeature-feature-flags';

/** Global : les adaptateurs (vérificateur JWT…) reçoivent le port sans importer le module. */
@Global()
@Module({
  providers: [
    // Lu à la création du module, après ConfigModule (backend/.env déjà dans process.env).
    {
      provide: FeatureFlags,
      useFactory: () => createFeatureFlags(process.env),
    },
  ],
  exports: [FeatureFlags],
})
export class FeatureFlagsModule {}
