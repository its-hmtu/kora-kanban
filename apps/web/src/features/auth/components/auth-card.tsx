import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  description?: string;
  /** data-testid for the heading. */
  testId?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared frame for the public sign-in pages. */
export function AuthCard({ title, description, testId, children, footer }: AuthCardProps) {
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 data-testid={testId} className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
      {footer ? <footer className="space-y-1 text-center text-sm">{footer}</footer> : null}
    </section>
  );
}
