import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from './api-client';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** The caller renders this mutation's errors itself, so the global toast stays silent. */
      inlineErrors?: boolean;
    };
  }
}

const MAX_RETRIES = 2;

/** Retry up to 2 times, except on 4xx responses, which will not succeed on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry } },
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.inlineErrors) return;
        toast.error(error.message);
      },
    }),
  });
}

export const queryClient = createQueryClient();
