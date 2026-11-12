import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC compile les décorateurs NestJS avec leurs métadonnées (esbuild ne sait pas les émettre).
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'] },
});
