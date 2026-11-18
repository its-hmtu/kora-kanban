import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const SCRIPT = join(ROOT, 'scripts/i18n-check.ts');

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Builds `<tmp>/locales/<locale>/<ns>.json` and `<tmp>/src/<file>` from a flat path map. */
function fixture(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-check-'));
  roots.push(dir);
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function run(dir: string) {
  const res = spawnSync(TSX, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      I18N_LOCALES_DIR: join(dir, 'locales'),
      I18N_SRC_DIR: join(dir, 'src'),
    },
  });
  return { code: res.status, out: res.stdout + res.stderr };
}

describe('i18n-check CLI', () => {
  it('exits 0 on a consistent fixture', () => {
    const dir = fixture({
      'locales/en/common.json': { save: 'Save', nested: { ok: 'OK' } },
      'locales/es/common.json': { save: 'Guardar', nested: { ok: 'OK' } },
      'src/app.tsx': `t('save'); t('common:nested.ok');`,
    });
    const { code, out } = run(dir);
    expect(out).toContain('i18n:check passed');
    expect(code).toBe(0);
  });

  it('exits 1 and lists a key missing from another locale', () => {
    const dir = fixture({
      'locales/en/board.json': { title: 'Board', add: 'Add' },
      'locales/fr/board.json': { title: 'Tableau' },
      'src/app.ts': '',
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('fr/board.json: missing key "add"');
  });

  it('exits 1 when a namespace file is missing from another locale', () => {
    const dir = fixture({
      'locales/en/board.json': { title: 'Board' },
      'locales/de/common.json': {},
      'src/app.ts': '',
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('de/board.json: missing key "title"');
  });

  it('exits 1 and lists code that uses a key missing from en', () => {
    const dir = fixture({
      'locales/en/common.json': { save: 'Save' },
      'src/app.tsx': `const a = t('save');\nconst b = t('card:unknown.key');`,
    });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('app.tsx:2: key "card:unknown.key" is not defined in en/card.json');
    expect(out).not.toContain('"common:save"');
  });

  it('ignores test files when scanning code', () => {
    const dir = fixture({
      'locales/en/common.json': {},
      'src/app.test.tsx': `t('does.not.exist')`,
    });
    expect(run(dir).code).toBe(0);
  });

  it('exits 1 when a directory is missing', () => {
    const dir = fixture({ 'src/app.ts': '' });
    const { code, out } = run(dir);
    expect(code).toBe(1);
    expect(out).toContain('directory not found');
  });
});
