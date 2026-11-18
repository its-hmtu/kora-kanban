import { describe, expect, it } from 'vitest';
import { diffKeys, extractKeys, flattenKeys, isKeyDefined } from './lib';

describe('flattenKeys', () => {
  it('flattens nested objects with dots and ignores non-string leaves', () => {
    expect(flattenKeys({ a: { b: 'x', c: { d: 'y' } }, e: 'z', f: 1, g: null })).toEqual([
      'a.b',
      'a.c.d',
      'e',
    ]);
  });
  it('returns [] for an empty object', () => {
    expect(flattenKeys({})).toEqual([]);
  });
});

describe('diffKeys', () => {
  it('returns keys of base missing from other, ignoring extras in other', () => {
    expect(diffKeys(['a', 'b', 'c'], ['b', 'x'])).toEqual(['a', 'c']);
  });
});

describe('isKeyDefined', () => {
  const keys = new Set(['title', 'items_one', 'items_other']);
  it('matches exact keys and plural variants', () => {
    expect(isKeyDefined(keys, 'title')).toBe(true);
    expect(isKeyDefined(keys, 'items')).toBe(true);
    expect(isKeyDefined(keys, 'nope')).toBe(false);
    expect(isKeyDefined(keys, 'ite')).toBe(false);
  });
});

describe('extractKeys', () => {
  it('defaults to the common namespace and parses ns:key', () => {
    const src = `t('save'); t("board:columns.add"); i18n.t('card:title', { x: 1 });`;
    expect(extractKeys(src).map(({ ns, key }) => `${ns}:${key}`)).toEqual([
      'common:save',
      'board:columns.add',
      'card:title',
    ]);
  });
  it('reads i18nKey props in both attribute forms', () => {
    const src = `<Trans i18nKey="auth:login.title" /><Trans i18nKey={'auth:login.hint'} />`;
    expect(extractKeys(src).map(({ ns, key }) => `${ns}:${key}`)).toEqual([
      'auth:login.title',
      'auth:login.hint',
    ]);
  });
  it('uses the namespace of useTranslation(ns) as default for bare keys', () => {
    const src = `const { t } = useTranslation('board');\nt('title'); t('common:ok');`;
    expect(extractKeys(src).map(({ ns, key }) => `${ns}:${key}`)).toEqual([
      'board:title',
      'common:ok',
    ]);
  });
  it('skips dynamic keys and lookalike calls, and reports line numbers', () => {
    const src = `split('a'); t(\`x.\${y}\`); t(name);\n\nt('real');`;
    expect(extractKeys(src)).toEqual([{ ns: 'common', key: 'real', line: 3 }]);
  });
});
