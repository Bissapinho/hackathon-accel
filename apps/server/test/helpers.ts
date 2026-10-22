import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { buildApp, type AppContext } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db/index.js';
import { createPool } from '../src/db/pool.js';
import { initReadOnly } from '../src/db/readonly.js';
import { stubOnProfileDone, stubSemanticsPort, type OnProfileDone, type SemanticsPort } from '../src/ports.js';

// Local Docker test database (never Aiven). Migrated and seeded by global-setup.ts.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://mini:mini@localhost:5432/mini_test';

export type TestApp = { app: FastifyInstance; ctx: AppContext; db: Db; pool: pg.Pool; close(): Promise<void> };

export async function buildTestApp(
  opts: { semantics?: SemanticsPort; onProfileDone?: OnProfileDone; dataDir?: string } = {},
): Promise<TestApp> {
  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    COOKIE_SECRET: 'test-cookie-secret-0123456789',
    ...(opts.dataDir ? { DATA_DIR: opts.dataDir } : {}),
  });
  const pool = createPool({ connectionString: TEST_DATABASE_URL, max: 3 });
  initReadOnly(pool);
  const db = createDb(pool);
  const { app, ctx } = await buildApp({
    config,
    db,
    pool,
    semantics: opts.semantics ?? stubSemanticsPort,
    onProfileDone: opts.onProfileDone ?? stubOnProfileDone,
  });
  return {
    app,
    ctx,
    db,
    pool,
    close: async () => {
      await app.close();
      await db.destroy();
    },
  };
}

// Logs in as a seeded user and returns the cookie header to send on later requests.
export async function loginAs(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { email } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === 'mini_uid');
  if (!cookie) throw new Error('login set no cookie');
  return `mini_uid=${cookie.value}`;
}
