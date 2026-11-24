import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, lastBody, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

async function submit(password: string, confirm = password) {
  fireEvent.change(await screen.findByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

describe('reset-password page', () => {
  it('resets with the token and links to /login on success', async () => {
    const fetchMock = stubApi();
    renderAt('/reset-password?token=tok123');
    await submit('correct horse battery');
    expect(await screen.findByText(/Your password has been reset/)).toBeInTheDocument();
    expect(lastBody(fetchMock)).toEqual({ token: 'tok123', password: 'correct horse battery' });
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/login');
  });

  it('blocks a mismatched confirmation without calling the API', async () => {
    const fetchMock = stubApi();
    renderAt('/reset-password?token=tok123');
    await submit('correct horse battery', 'different one here');
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the invalid-link message on TOKEN_INVALID', async () => {
    stubApi(() => apiError(422, 'VALIDATION', { fieldErrors: { token: ['TOKEN_INVALID'] } }));
    renderAt('/reset-password?token=bad');
    await submit('correct horse battery');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows PASSWORD_BREACHED on the password field', async () => {
    stubApi(() =>
      apiError(422, 'VALIDATION', { fieldErrors: { password: ['PASSWORD_BREACHED'] } }),
    );
    renderAt('/reset-password?token=t');
    await submit('correct horse battery');
    expect(await screen.findByText(/appeared in a data breach/)).toBeInTheDocument();
  });

  it('shows the invalid message when there is no token', async () => {
    renderAt('/reset-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });
});
