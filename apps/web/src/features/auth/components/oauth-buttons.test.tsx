import { QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../../../../test/i18n';
import { queryClient } from '@/lib/query-client';
import { resetAuthTestState, stubApi } from '../test-helpers';
import { OAuthButtons } from './oauth-buttons';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

const renderButtons = (next?: string) =>
  renderWithI18n(
    <QueryClientProvider client={queryClient}>
      <OAuthButtons next={next} />
    </QueryClientProvider>,
  );

const serve = (providers: string[]) =>
  stubApi((path) =>
    path === '/auth/oauth/providers' ? { status: 200, body: { providers } } : undefined,
  );

describe('OAuthButtons', () => {
  it('renders both providers and the divider when both are configured', async () => {
    const fetchMock = serve(['google', 'github']);
    renderButtons('/boards/1');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/v1/auth/oauth/google?next=%2Fboards%2F1',
    );
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/oauth/providers',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('renders only the configured provider', async () => {
    serve(['github']);
    renderButtons();
    expect(await screen.findByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('renders nothing, not even the divider, when no provider is configured', async () => {
    const fetchMock = serve([]);
    const { container } = renderButtons();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the providers request fails', async () => {
    const fetchMock = stubApi(() => ({ status: 500 }));
    const { container } = renderButtons();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(container).toBeEmptyDOMElement();
  });
});
