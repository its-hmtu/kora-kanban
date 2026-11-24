import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, lastBody, renderAt, resetAuthTestState, stubApi } from '../test-helpers';

beforeEach(resetAuthTestState);
afterEach(() => vi.unstubAllGlobals());

async function submit(email: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('forgot-password page', () => {
  it('always shows the same confirmation after submit', async () => {
    const fetchMock = stubApi();
    renderAt('/forgot-password');
    await submit('Who@Example.com');
    expect(await screen.findByText(/If an account exists for that address/)).toBeInTheDocument();
    expect(lastBody(fetchMock)).toEqual({ email: 'who@example.com' });
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('validates the email client-side', async () => {
    const fetchMock = stubApi();
    renderAt('/forgot-password');
    await submit('nope');
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the throttled message on 429', async () => {
    stubApi(() => apiError(429, 'RATE_LIMITED'));
    renderAt('/forgot-password');
    await submit('a@b.co');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });
});
