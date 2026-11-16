import { render, screen } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router';

describe('app router', () => {
  it('renders the root shell with the index route inside it', async () => {
    const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
    render(<RouterProvider router={router} />);

    expect(await screen.findByTestId('app-shell')).toBeInTheDocument();
    expect(await screen.findByTestId('index-page')).toBeInTheDocument();
  });
});
