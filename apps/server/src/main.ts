import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { createPool } from './db/pool.js';
import { initReadOnly } from './db/readonly.js';
import { stubOnProfileDone, stubSemanticsPort } from './ports.js';

// pnpm dev — the server on PORT (4000).
const config = loadConfig();
const pool = createPool({ connectionString: config.DATABASE_URL, caCertPath: config.DATABASE_CA_CERT, max: config.DB_POOL_MAX });
initReadOnly(pool);
const db = createDb(pool);

// Phase 0 stubs (09 §4.1, §4.2); replaced by Part B's real port and hook at integration.
const { app } = await buildApp(
  { config, db, semantics: stubSemanticsPort, onProfileDone: stubOnProfileDone },
  { logger: true },
);

await app.listen({ port: config.PORT, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    await db.destroy();
    process.exit(0);
  });
}
