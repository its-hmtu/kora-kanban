import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkI18n } from './i18n-check/lib';

// Defaults to the web app; I18N_LOCALES_DIR / I18N_SRC_DIR let tests point at fixtures.
const localesDir = resolve(process.env.I18N_LOCALES_DIR ?? 'apps/web/src/i18n/locales');
const srcDir = resolve(process.env.I18N_SRC_DIR ?? 'apps/web/src');

for (const dir of [localesDir, srcDir]) {
  if (!existsSync(dir)) {
    console.error(`i18n:check: directory not found: ${dir}`);
    process.exit(1);
  }
}

const problems = checkI18n({ localesDir, srcDir });
if (problems.length > 0) {
  console.error(`i18n:check failed with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('i18n:check passed');
