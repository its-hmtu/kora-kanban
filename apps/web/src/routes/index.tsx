import { createFileRoute } from '@tanstack/react-router';

// Placeholder page: visible text is intentionally absent until i18n lands (T042).
export const Route = createFileRoute('/')({
  component: () => <main data-testid="index-page" />,
});
