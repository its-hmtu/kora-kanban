import { createFileRoute } from '@tanstack/react-router';

// Placeholder page: no visible text yet; any text added here must go through i18next.
export const Route = createFileRoute('/_app/')({
  component: () => <main data-testid="index-page" />,
});
