import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    globalSetup: ['test/setup/global-setup.ts'],
    // First use of the harness clones a database; allow for slow container/CI machines.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
  // swcrc: false so the build-only .swcrc (which excludes specs) is not applied to tests.
  plugins: [
    swc.vite({
      swcrc: false,
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
        keepClassNames: true,
      },
    }),
  ],
});
