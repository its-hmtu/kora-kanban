import { DEFAULT_LOCALE, type ErrorCode, type Locale } from '@kora/shared';
import en from './messages/en.json';

type Catalog = Record<ErrorCode, string>;

// Only `en` exists so far; add further locale JSON files here as they are written.
const catalogs: Partial<Record<Locale, Catalog>> = { en };

/** Picks the first Accept-Language tag (by q-value) that has a catalog, else DEFAULT_LOCALE. */
export function pickLocale(acceptLanguage: string | undefined): Locale {
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter(({ tag, q }) => tag !== '' && !Number.isNaN(q) && q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const match = (Object.keys(catalogs) as Locale[]).find(
      (locale) => tag === locale.toLowerCase().replace('_', '-') || tag.split('-')[0] === locale,
    );
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export function localizeMessage(code: ErrorCode, locale: Locale): string {
  return (catalogs[locale] ?? en)[code];
}
