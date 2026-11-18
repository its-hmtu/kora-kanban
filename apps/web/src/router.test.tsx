import { render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router';

describe('app router', () => {
  it('renders the root shell with a public route inside it', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/login'] }));
    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });
});
