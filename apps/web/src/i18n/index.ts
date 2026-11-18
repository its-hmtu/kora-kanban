import { DEFAULT_LOCALE, LOCALES } from '@kora/shared';
import i18n from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import { setLanguageGetter } from '@/lib/api-client';

export const NAMESPACES = [
  'common',
  'auth',
  'workspace',
  'board',
  'card',
  'notifications',
  'settings',
] as const;
export type Namespace = (typeof NAMESPACES)[number];
export const DEFAULT_NS: Namespace = 'common';

// Locale ids are the BCP-47 tags from @kora/shared (e.g. `zh-CN`), used verbatim as i18next
// language codes and as `locales/<id>/` folder names. (The API's Prisma enum spells it `zh_CN`
// only because enum members cannot contain `-`; that mapping lives in the API layer.)
// Each locale/namespace file is its own lazy chunk; a folder that does not exist yet resolves to
// empty resources, so lookups fall back to `en`. `pnpm i18n:check` guards the folders that exist.
const loaders = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', {
  import: 'default',
});

export const i18nReady = i18n
  .use(initReactI18next)
  .use(
    resourcesToBackend(
      (lng: string, ns: string) => loaders[`./locales/${lng}/${ns}.json`]?.() ?? {},
    ),
  )
  .init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    // `zh-CN` must not also try to load a `zh` folder.
    load: 'currentOnly',
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NS,
    interpolation: { escapeValue: false }, // React already escapes
  });

setLanguageGetter(() => i18n.language);

export default i18n;
