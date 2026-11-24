import { StrictMode } from 'react';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

const verifyCalls = (f: ReturnType<typeof stubApi>) =>
  f.mock.calls.filter(([u]) => String(u).endsWith('/auth/verify-email'));

describe('verify-email page', () => {
  it('verifies once on mount and shows success with a link to the app', async () => {
    const fetchMock = stubApi();
    renderAt('/verify-email?token=abc');
    expect(await screen.findByText('Your email address is verified.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to Kora' })).toHaveAttribute('href', '/');
    expect(verifyCalls(fetchMock)).toHaveLength(1);
    expect(JSON.parse(String(verifyCalls(fetchMock)[0]?.[1]?.body))).toEqual({ token: 'abc' });
  });

  it('calls verify only once under StrictMode', async () => {
    const fetchMock = stubApi();
    const { createAppRouter } = await import('@/router');
    const { createMemoryHistory, RouterProvider } = await import('@tanstack/react-router');
    const { renderWithI18n } = await import('../../../../test/i18n');
    renderWithI18n(
      <StrictMode>
        <RouterProvider
          router={createAppRouter(
            createMemoryHistory({ initialEntries: ['/verify-email?token=abc'] }),
          )}
        />
      </StrictMode>,
    );
    await screen.findByText('Your email address is verified.');
    expect(verifyCalls(fetchMock)).toHaveLength(1);
  });

  it('shows the invalid message on TOKEN_INVALID', async () => {
    stubApi(() => apiError(422, 'VALIDATION', { fieldErrors: { token: ['TOKEN_INVALID'] } }));
    renderAt('/verify-email?token=bad');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });

  it('shows the invalid message without calling the API when there is no token', async () => {
    const fetchMock = stubApi();
    renderAt('/verify-email');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(verifyCalls(fetchMock)).toHaveLength(0);
  });
});
