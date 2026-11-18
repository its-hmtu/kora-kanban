import { render } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { DEFAULT_NS, NAMESPACES } from '@/i18n';

// Every `en` namespace, bundled eagerly: tests get synchronous translations, no lazy chunks.
const bundles = import.meta.glob<Record<string, unknown>>('../src/i18n/locales/en/*.json', {
  eager: true,
  import: 'default',
});

/** A standalone English i18n instance (does not touch the app singleton). */
export function createTestI18n() {
  const resources = {
    en: Object.fromEntries(
      NAMESPACES.map((ns) => [ns, bundles[`../src/i18n/locales/en/${ns}.json`] ?? {}]),
    ),
  };
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources,
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NS,
    initAsync: false, // resources are inline, so init completes synchronously
    interpolation: { escapeValue: false },
  });
  return instance;
}

/** `render` wrapped in an English `I18nextProvider`, so `useTranslation()` works synchronously. */
export function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={createTestI18n()}>{ui}</I18nextProvider>);
}
