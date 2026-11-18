import type { Locale } from '@kora/shared';

/** A per-template string dictionary. Only `en` is required; other locales fall back to it. */
export type Dictionary<T> = { en: T } & Partial<Record<Locale, T>>;

export function pick<T>(dictionary: Dictionary<T>, locale: Locale): T {
  return dictionary[locale] ?? dictionary.en;
}
