import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ErrorCode, type ApiError } from '@kora/shared';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error';
import { localizeMessage, resolveLocale } from '../i18n/messages';

const STATUS_CODES: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.VALIDATION,
  429: ErrorCode.RATE_LIMITED,
};

interface ClientHttpError extends Error {
  status?: number;
  statusCode?: number;
  expose: true;
}

function isClientHttpError(e: unknown): e is ClientHttpError {
  if (!(e instanceof Error)) return false;
  const { status, statusCode, expose } = e as Partial<ClientHttpError>;
  const s = typeof status === 'number' ? status : statusCode;
  return expose === true && typeof s === 'number' && s >= 400 && s <= 499;
}

/** Maps every thrown error onto the `ApiError` envelope. Never leaks internals. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    let status = 500;
    let code = ErrorCode.INTERNAL;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof DomainError) {
      ({ status, code, details } = exception);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? ErrorCode.INTERNAL;
    } else if (isClientHttpError(exception)) {
      // Express/body-parser errors (413 too large, 415 charset, 400 aborted…) are plain http-errors.
      // Only the status is forwarded; their messages are never exposed.
      status = exception.status ?? exception.statusCode ?? 500;
      code = STATUS_CODES[status] ?? ErrorCode.INTERNAL;
      this.logger.warn(`${req.method} ${req.url}: ${status} ${exception.message}`);
    } else {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`${req.method} ${req.url}: ${err.message}`, err.stack);
    }

    const locale = resolveLocale(req.user?.locale, req.headers['accept-language']);
    const body: ApiError = {
      error: {
        code,
        message: localizeMessage(code, locale),
        ...(details === undefined ? {} : { details }),
      },
    };
    res.status(status).json(body);
  }
}
