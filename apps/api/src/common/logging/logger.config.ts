import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

/**
 * JSON logs everywhere except development (pretty) and test (silent). Modules pass NODE_ENV from
 * `APP_CONFIG` (`LoggerModule.forRootAsync`).
 */
export function buildLoggerParams(
  nodeEnv: string | undefined,
  stream?: { write(s: string): void },
): Params {
  return {
    pinoHttp: {
      level: nodeEnv === 'test' ? 'silent' : 'info',
      genReqId: (req) => {
        const header = req.headers['x-request-id'];
        return (Array.isArray(header) ? header[0] : header) || randomUUID();
      },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
      },
      ...(nodeEnv === 'development' && !stream
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
      ...(stream ? { stream } : {}),
    },
  };
}
