import { LOCALES } from '@kora/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import i18n, { DEFAULT_NS, i18nReady, NAMESPACES } from './index';

afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en');
});

describe('i18n', () => {
  it('lazily loads the default namespace for the default language', async () => {
    await i18nReady;
    expect(i18n.language).toBe('en');
    expect(i18n.t('app.name')).toBe('Kora');
    expect(DEFAULT_NS).toBe('common');
  });

  it('declares the namespaces and supports every shared locale', () => {
    expect(NAMESPACES).toEqual([
      'common',
      'auth',
      'workspace',
      'board',
      'card',
      'notifications',
      'settings',
    ]);
    expect(i18n.options.supportedLngs).toEqual(expect.arrayContaining([...LOCALES]));
  });

  it('falls back to en for a supported locale that has no resources yet', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.language).toBe('zh-CN');
    expect(i18n.t('app.name')).toBe('Kora');
  });

  it('registers the current language with the API client', async () => {
    await i18n.changeLanguage('vi');
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/boards');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(init.headers).get('Accept-Language')).toBe('vi');
  });
});
