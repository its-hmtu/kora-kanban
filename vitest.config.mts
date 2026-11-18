import { defineConfig } from 'vitest/config';

// Root config only covers the repo-level scripts; packages run their own vitest via turbo.
export default defineConfig({
  test: { include: ['scripts/**/*.test.ts'] },
});
