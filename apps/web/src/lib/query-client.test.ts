import { ErrorCode } from '@kora/shared';
import { MutationObserver } from '@tanstack/react-query';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client';
import { createQueryClient, queryClient, shouldRetry } from './query-client';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

afterEach(() => vi.clearAllMocks());

const apiError = (status: number) => new ApiError(status, ErrorCode.INTERNAL, 'boom');

describe('query client', () => {
  it('defaults staleTime to 30 s', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });

  it('does not retry 4xx ApiErrors', () => {
    expect(shouldRetry(0, apiError(400))).toBe(false);
    expect(shouldRetry(0, apiError(404))).toBe(false);
    expect(shouldRetry(0, apiError(499))).toBe(false);
  });

  it('retries 5xx and network errors at most 2 times', () => {
    for (const err of [apiError(500), new TypeError('network')]) {
      expect(shouldRetry(0, err)).toBe(true);
      expect(shouldRetry(1, err)).toBe(true);
      expect(shouldRetry(2, err)).toBe(false);
    }
  });

  it('is wired as the queries retry option', () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    expect(retry).toBe(shouldRetry);
  });

  it('toasts the message of a failing mutation', async () => {
    const client = createQueryClient();
    const observer = new MutationObserver(client, {
      mutationFn: () => Promise.reject(apiError(409)),
    });
    await observer.mutate().catch(() => {});
    expect(toast.error).toHaveBeenCalledWith('boom');
  });
});
