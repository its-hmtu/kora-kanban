export enum ErrorCode {
  UNAUTHENTICATED = "UNAUTHENTICATED",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION = "VALIDATION",
  CONFLICT = "CONFLICT",
  RATE_LIMITED = "RATE_LIMITED",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
  WIP_LIMIT = "WIP_LIMIT",
  WORKFLOW_VIOLATION = "WORKFLOW_VIOLATION",
  LAST_OWNER = "LAST_OWNER",
  SESSION_REVOKED = "SESSION_REVOKED",
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
