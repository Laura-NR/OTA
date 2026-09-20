import { z } from 'zod';

/**
 * Server-side environment schema. Parsing fails fast on a missing or malformed
 * value instead of letting `undefined` leak into the application.
 *
 * Optional external-service credentials are intentionally optional: the payment
 * and AI providers are unselected until ADR 0002, and development runs against a
 * mock adapter.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  TENANT_ID: z.string().min(1).default('cuba-eco-travel'),

  DATABASE_URL: z.string().url(),
  DATABASE_READONLY_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('ota-documents'),

  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('no-reply@example.test'),

  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment record. Throws a ZodError listing every
 * invalid variable so misconfiguration is visible at startup, not at first use.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
