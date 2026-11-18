import { describe, expect, it } from 'vitest';
import { ErrorCode, type ApiError } from './errors';

describe('ErrorCode', () => {
  it('has values equal to their names', () => {
    const names = [
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'NOT_FOUND',
      'VALIDATION',
      'CONFLICT',
      'RATE_LIMITED',
      'PAYLOAD_TOO_LARGE',
      'WIP_LIMIT',
      'WORKFLOW_VIOLATION',
      'LAST_OWNER',
      'SESSION_REVOKED',
      'INTERNAL',
    ];
    expect(Object.keys(ErrorCode).sort()).toEqual([...names].sort());
    for (const n of names) expect(ErrorCode[n as keyof typeof ErrorCode]).toBe(n);
  });
  it('fits the ApiError envelope', () => {
    const e: ApiError = {
      error: { code: ErrorCode.WIP_LIMIT, message: 'm', details: { limit: 3 } },
    };
    expect(e.error.code).toBe('WIP_LIMIT');
  });
});
