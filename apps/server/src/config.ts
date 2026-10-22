import { z } from 'zod';

// Server configuration from the environment (01-architecture §6). Parsed once at startup.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().optional(),
  MINI_APP_PASSWORD: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  PREVIEW_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  COOKIE_SECRET: z.string().min(16).default('dev-only-cookie-secret-change-me'),
  DATA_DIR: z.string().default('./var/uploads'),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(400),
  PORT: z.coerce.number().int().positive().default(4000),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty strings in .env mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration in .env: ${fields}. See .env.example.`);
  }
  return parsed.data;
}
