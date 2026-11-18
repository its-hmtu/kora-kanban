import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const BASE_LOCALE = 'en';
const DEFAULT_NAMESPACE = 'common';
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

export interface UsedKey {
  ns: string;
  key: string;
  line: number;
}

/** Dotted paths of every string leaf in a (nested) translation resource. */
export function flattenKeys(resource: object, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [name, value] of Object.entries(resource)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') keys.push(path);
    else if (value !== null && typeof value === 'object') keys.push(...flattenKeys(value, path));
  }
  return keys;
}

/** Keys present in `base` but absent from `other`. */
export function diffKeys(base: readonly string[], other: readonly string[]): string[] {
  const have = new Set(other);
  return base.filter((key) => !have.has(key));
}

/** A used key is defined if it exists verbatim or as an i18next plural variant (`key_one`...). */
export function isKeyDefined(defined: ReadonlySet<string>, key: string): boolean {
  return defined.has(key) || PLURAL_SUFFIXES.some((suffix) => defined.has(`${key}_${suffix}`));
}

const T_CALL = /(?<![\w$])t\(\s*(['"])([^'"\n]+)\1/g;
const I18N_KEY_PROP = /i18nKey=(?:"([^"\n]+)"|\{\s*'([^'\n]+)'\s*\})/g;
const USE_TRANSLATION = /useTranslation\(\s*['"]([^'"\n]+)['"]/;

/** Static translation keys used in a source file: `t('ns:key')`, `t('key')` and `i18nKey="…"`. */
export function extractKeys(source: string): UsedKey[] {
  const fileNs = USE_TRANSLATION.exec(source)?.[1] ?? DEFAULT_NAMESPACE;
  const found: (UsedKey & { index: number })[] = [];
  const add = (raw: string, index: number) => {
    const sep = raw.indexOf(':');
    const [ns, key] = sep === -1 ? [fileNs, raw] : [raw.slice(0, sep), raw.slice(sep + 1)];
    const line = source.slice(0, index).split('\n').length;
    found.push({ ns: ns!, key: key!, line, index });
  };
  for (const m of source.matchAll(T_CALL)) add(m[2]!, m.index);
  for (const m of source.matchAll(I18N_KEY_PROP)) add((m[1] ?? m[2])!, m.index);
  return found.sort((a, b) => a.index - b.index).map(({ ns, key, line }) => ({ ns, key, line }));
}

type Resources = Map<string, Set<string>>; // namespace -> keys

function loadLocale(dir: string): Resources {
  const resources: Resources = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8')) as object;
    resources.set(file.slice(0, -'.json'.length), new Set(flattenKeys(json)));
  }
  return resources;
}

function* walkSources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules') yield* walkSources(path);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.tsx?$/.test(name) &&
      !name.endsWith('.d.ts')
    ) {
      yield path;
    }
  }
}

/** Runs both checks and returns human-readable problems (empty when clean). */
export function checkI18n({
  localesDir,
  srcDir,
}: {
  localesDir: string;
  srcDir: string;
}): string[] {
  const problems: string[] = [];
  const base = loadLocale(join(localesDir, BASE_LOCALE));

  const others = readdirSync(localesDir).filter(
    (name) => name !== BASE_LOCALE && statSync(join(localesDir, name)).isDirectory(),
  );
  for (const locale of others) {
    const resources = loadLocale(join(localesDir, locale));
    for (const [ns, keys] of base) {
      for (const key of diffKeys([...keys], [...(resources.get(ns) ?? [])])) {
        problems.push(`${locale}/${ns}.json: missing key "${key}" (present in ${BASE_LOCALE})`);
      }
    }
  }

  for (const file of walkSources(srcDir)) {
    for (const { ns, key, line } of extractKeys(readFileSync(file, 'utf8'))) {
      const defined = base.get(ns);
      if (!defined || !isKeyDefined(defined, key)) {
        problems.push(
          `${relative(srcDir, file)}:${line}: key "${ns}:${key}" is not defined in ${BASE_LOCALE}/${ns}.json`,
        );
      }
    }
  }
  return problems;
}
