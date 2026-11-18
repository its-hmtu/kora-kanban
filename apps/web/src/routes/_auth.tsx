import { createFileRoute, Outlet } from '@tanstack/react-router';

// Public layout for the login and register pages.
export const Route = createFileRoute('/_auth')({
  component: () => (
    <main data-testid="auth-layout" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </main>
  ),
});
