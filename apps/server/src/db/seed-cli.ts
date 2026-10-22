import { loadConfig } from '../config.js';
import { createDb } from './index.js';
import { createPool } from './pool.js';
import { seed, SEED_PROJECT_NAME } from './seed.js';

// pnpm db:seed — demo users (Ada owner, Ben viewer) and the project "Kumo 2025".
const config = loadConfig();
const pool = createPool({ connectionString: config.DATABASE_URL, caCertPath: config.DATABASE_CA_CERT, max: 1 });
const db = createDb(pool);
try {
  const { projectId } = await seed(db);
  console.log(`seeded users and project "${SEED_PROJECT_NAME}" (${projectId})`);
} finally {
  await db.destroy();
}
