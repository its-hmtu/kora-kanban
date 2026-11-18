import { z } from 'zod';

/** Empty strings (e.g. `FOO=` in .env) count as "not set". */
const blankToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());
const required = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema);
const withDefault = <T extends z.ZodType>(schema: T, value: NonNullable<z.output<T>>) =>
  z.preprocess(blankToUndefined, schema.default(value as never));

const url = z.url();
const text = z.string().min(1);

// Strict standard base64 (Node's decoder silently skips invalid characters, so check the alphabet).
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const encryptionKey = z
  .string()
  .refine((v) => BASE64.test(v) && Buffer.from(v, 'base64').length === 32, {
    message: 'must be base64 encoding of exactly 32 bytes',
  });

export const envSchema = z.object({
  NODE_ENV: withDefault(z.enum(['development', 'test', 'production']), 'development'),
  PORT: withDefault(z.coerce.number().int().min(1).max(65535), 3000),
  // Reverse-proxy hops to trust for the client IP (X-Forwarded-For); 0 = off. Drives rate-limit keys.
  TRUST_PROXY: withDefault(z.coerce.number().int().min(0), 0),

  // Core
  DATABASE_URL: required(url),
  REDIS_URL: required(url),
  APP_URL: required(url),
  API_URL: required(url),
  SESSION_SECRET: required(z.string().min(32)),
  ENCRYPTION_KEY: required(encryptionKey),

  // Object storage (optional until attachments)
  R2_ACCOUNT_ID: optional(text),
  R2_ACCESS_KEY_ID: optional(text),
  R2_SECRET_ACCESS_KEY: optional(text),
  R2_BUCKET: optional(text),
  S3_ENDPOINT: optional(url),

  // Email: empty RESEND_API_KEY falls back to Mailpit SMTP (T035)
  RESEND_API_KEY: optional(text),
  MAIL_FROM: required(text),
  SMTP_URL: withDefault(url, 'smtp://localhost:1025'),

  // OAuth login
  GOOGLE_CLIENT_ID: optional(text),
  GOOGLE_CLIENT_SECRET: optional(text),
  GITHUB_CLIENT_ID: optional(text),
  GITHUB_CLIENT_SECRET: optional(text),

  // Web push
  VAPID_PUBLIC_KEY: optional(text),
  VAPID_PRIVATE_KEY: optional(text),
  VAPID_SUBJECT: optional(text),

  // P4 integrations
  SLACK_CLIENT_ID: optional(text),
  SLACK_CLIENT_SECRET: optional(text),
  SLACK_SIGNING_SECRET: optional(text),
  GITHUB_APP_ID: optional(text),
  GITHUB_APP_PRIVATE_KEY: optional(text),
  GITHUB_APP_WEBHOOK_SECRET: optional(text),
  GITLAB_WEBHOOK_SECRET: optional(text),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates the environment, throwing on the first call if anything is invalid.
 * The error names every offending variable but never echoes values (they may be secrets).
 */
export function loadEnv(
  raw: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;
  const names = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? '(root)')))];
  throw new Error(`Invalid environment configuration: ${names.join(', ')}`);
}
