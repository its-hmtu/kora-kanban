import type { ErrorCode } from '@kora/shared';

/** A business-rule failure that maps 1:1 onto the `ApiError` envelope. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
