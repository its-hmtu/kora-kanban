import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { i18nReady } from './i18n';
import { createAppRouter } from './router';
import './styles/globals.css';

const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

const root = createRoot(document.getElementById('root')!);

// Render only once the default language is loaded so no component renders untranslated.
try {
  await i18nReady;
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
} catch (error) {
  // Translations are unavailable here, so this one message is deliberately not localised.
  console.error('Failed to initialise i18n', error);
  root.render(<p role="alert">Kora failed to load. Please reload the page.</p>);
}
