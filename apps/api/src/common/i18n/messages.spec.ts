import { describe, expect, it } from 'vitest';
import { resolveLocale } from './messages';

describe('resolveLocale', () => {
  it("prefers the user's locale over Accept-Language, even without a catalog for it", () => {
    expect(resolveLocale('vi', 'fr')).toBe('vi');
  });

  it('maps the Prisma zh_CN enum value to zh-CN', () => {
    expect(resolveLocale('zh_CN', 'en')).toBe('zh-CN');
  });

  it('falls back to Accept-Language, then en, without a user locale', () => {
    expect(resolveLocale(undefined, 'en-GB,fr;q=0.5')).toBe('en');
    expect(resolveLocale(undefined, 'xx')).toBe('en');
    expect(resolveLocale(undefined, undefined)).toBe('en');
  });

  it('ignores an unknown user locale', () => {
    expect(resolveLocale('klingon', 'en')).toBe('en');
  });
});
