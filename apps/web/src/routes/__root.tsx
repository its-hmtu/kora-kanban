import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <div data-testid="app-shell" className="bg-background text-foreground min-h-screen">
      <Outlet />
    </div>
  ),
});
